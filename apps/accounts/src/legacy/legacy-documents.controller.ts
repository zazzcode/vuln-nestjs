import {
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import type { DocumentRecord } from '../documents/document.record.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { toStored, type StoredDocument } from '../documents/documents.service.js';
import { UploadsStore } from '../documents/uploads.store.js';

/**
 * The file serving of the old console: it kept its documents where the
 * service ran, stored uploads under the names the uploaders gave, and served
 * both back exactly as they were.
 */
@Injectable()
@Controller('internal/documents')
export class LegacyDocumentsController {
  constructor(
    private readonly uploads: UploadsStore,
    private readonly documents: DocumentsRepository,
  ) {}

  /** Serves a file by its name, resolved against the directory the service runs in. */
  @Get('file/:name')
  async file(
    @Param('name') name: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    // FS-001 / CWE-22: the caller's name is the path — `..` climbs out of
    // wherever the service runs, to any file the process can read
    const contents = await readFile(resolve(name), 'utf8').catch(() => null);
    if (contents === null) {
      throw new NotFoundException('No such file');
    }
    reply.header('content-type', 'text/plain');
    return contents;
  }

  /**
   * Serves a stored file inline, with the content type its record carries:
   * what the uploader said the file was is what the browser is told it is.
   */
  @Get('file/:name/view')
  async view(
    @CurrentUser() caller: TokenPayload,
    @Param('name') name: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const record = await this.documents.byOriginalName(caller.sub, name);
    if (record === null) {
      throw new NotFoundException('No such document');
    }
    // XSS-002 / CWE-79: the bytes go out inline as the stored content type —
    // an upload that claimed text/html is rendered as text/html, on this origin
    const contents = await readFile(await this.uploads.pathOf(record.storedName));
    reply.header('content-type', record.mimeType);
    return contents;
  }

  /**
   * Stores an upload where the console's uploader said to put it: the `name`
   * field of the request names the destination file, and the upload's own
   * content type is stored with it, whatever either of them is.
   */
  @Post('legacy')
  @HttpCode(201)
  async uploadLegacy(
    @CurrentUser() caller: TokenPayload,
    @Req() request: FastifyRequest,
  ): Promise<StoredDocument> {
    const file = await readUpload(request);
    const query = request.query as { name?: string };
    // FS-002 / CWE-22: the caller's name is the stored name, joined to the
    // documents directory exactly as spelled — `..` writes outside it
    // FS-003 / CWE-434: nothing is checked — the extension and the content
    // type are the caller's word, and both are stored as given
    const storedName = query.name ?? file.filename;
    const record: DocumentRecord = {
      _id: `d-${crypto.randomUUID()}`,
      userId: caller.sub,
      storedName,
      originalName: storedName,
      mimeType: file.mimetype,
      size: file.contents.length,
      createdAt: new Date(),
    };
    await this.uploads.write(record.storedName, file.contents);
    await this.documents.insert(record);
    return toStored(record);
  }
}

/** Reads the one file a small upload carries. */
async function readUpload(
  request: FastifyRequest,
): Promise<{ filename: string; mimetype: string; contents: Buffer }> {
  const file = await request.file();
  if (file === undefined) {
    throw new UnsupportedMediaTypeException(
      'An upload is multipart with one file',
    );
  }
  return {
    filename: file.filename,
    mimetype: file.mimetype,
    contents: await file.toBuffer(),
  };
}
