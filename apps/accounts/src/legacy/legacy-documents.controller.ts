import {
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * The file serving of the old console: it kept its documents where the
 * service ran and served them by name, exactly as the console spelled it.
 */
@Injectable()
@Controller('internal/documents')
export class LegacyDocumentsController {
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
}
