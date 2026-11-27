import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { toStored, type StoredDocument } from './documents.service.js';
import { DocumentsService } from './documents.service.js';

/** The caller's own documents: upload, list, read. The name of a file never builds a path here. */
@Controller('internal/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Stores an upload under a generated name, its extension and size checked against an allowlist. */
  @Post()
  async upload(
    @CurrentUser() caller: TokenPayload,
    @Req() request: FastifyRequest,
  ): Promise<StoredDocument> {
    const file = await readUpload(request);
    return this.documents.store(caller.sub, file.filename, file.contents, {
      checkSignature: false,
    });
  }

  /** The same, plus the file's signature: the bytes must agree with the extension. */
  @Post('checked')
  async uploadChecked(
    @CurrentUser() caller: TokenPayload,
    @Req() request: FastifyRequest,
  ): Promise<StoredDocument> {
    const file = await readUpload(request);
    return this.documents.store(caller.sub, file.filename, file.contents, {
      checkSignature: true,
    });
  }

  /** The caller's documents, newest first. */
  @Get()
  async list(@CurrentUser() caller: TokenPayload): Promise<StoredDocument[]> {
    return (await this.documents.ofUser(caller.sub)).map(toStored);
  }

  /** One document's metadata, the caller's own. */
  @Get(':id')
  async one(
    @CurrentUser() caller: TokenPayload,
    @Param('id') id: string,
  ): Promise<StoredDocument> {
    return toStored(await this.documents.ownDocument(caller.sub, id));
  }

  /** One document by the name the caller gave it, its path resolved and checked before it is read. */
  @Get('by-name/:name')
  async byName(
    @CurrentUser() caller: TokenPayload,
    @Param('name') name: string,
    @Res() reply: FastifyReply,
  ) {
    const found = await this.documents.contentsByName(caller.sub, name);
    if (found === null) {
      reply.code(404).send({ message: 'No such document' });
      return;
    }
    reply
      .header('content-type', found.record.mimeType)
      .header('content-disposition', 'attachment')
      .header('x-content-type-options', 'nosniff')
      .send(found.contents);
  }

  /**
   * Serves a document as an attachment, never inline: what a browser does with
   * downloaded bytes is not scripting on this origin.
   */
  @Get(':id/view')
  async view(
    @CurrentUser() caller: TokenPayload,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const record = await this.documents.ownDocument(caller.sub, id);
    const contents = await this.documents.contentsOf(record);
    reply
      .header('content-type', record.mimeType)
      .header('content-disposition', 'attachment')
      .header('x-content-type-options', 'nosniff')
      .send(contents);
  }

  /** Serves a document inline, but only an image, and only with `nosniff`. */
  @Get(':id/image')
  async image(
    @CurrentUser() caller: TokenPayload,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const record = await this.documents.ownDocument(caller.sub, id);
    if (!record.mimeType.startsWith('image/')) {
      throw new UnsupportedMediaTypeException('That document is not an image');
    }
    const contents = await this.documents.contentsOf(record);
    reply
      .header('content-type', record.mimeType)
      .header('x-content-type-options', 'nosniff')
      .send(contents);
  }
}

/** Reads the one file a small upload carries. The size cap is enforced by the service. */
async function readUpload(
  request: FastifyRequest,
): Promise<{ filename: string; contents: Buffer }> {
  const file = await request.file();
  if (file === undefined) {
    throw new UnsupportedMediaTypeException(
      'An upload is multipart with one file',
    );
  }
  const contents = await file.toBuffer();
  return { filename: file.filename, contents };
}
