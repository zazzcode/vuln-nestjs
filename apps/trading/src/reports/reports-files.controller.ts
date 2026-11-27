import { Controller, Get, Param, Res } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPORTS_DIRECTORY } from './reports.service.js';

/** A report file, by the name the caller gives. */
@Controller('internal/reports')
export class ReportsFilesController {
  @Get('files/:name')
  async file(
    @UserId() caller: string,
    @Param('name') name: string,
    @Res() reply: FastifyReply,
  ) {
    // FS-004 / CWE-22: the name is joined to the directory as it came, and nothing checks where the path lands
    const contents = await readFile(join(REPORTS_DIRECTORY, name));
    reply.header('content-type', 'application/octet-stream').send(contents);
  }
}
