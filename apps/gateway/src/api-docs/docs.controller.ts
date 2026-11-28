import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { OpenapiService } from '../openapi/openapi.service.js';

/**
 * The API pages of the lab, open to anyone: a small local index that links to
 * the document, and the document itself.
 */
@Controller()
export class DocsController {
  constructor(private readonly openapi: OpenapiService) {}

  /** CONFIG-003 / CWE-200: the whole API surface, served with no authentication. */
  @Public()
  @Get('docs')
  index(@Res({ passthrough: true }) reply: FastifyReply): string {
    reply.header('content-type', 'text/html; charset=utf-8');
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>VCX API</title>
  </head>
  <body>
    <h1>VCX API</h1>
    <p>The API document of the gateway is <a href="/docs/json">here</a>.</p>
  </body>
</html>
`;
  }

  /** CONFIG-003 / CWE-200: the OpenAPI document, served with no authentication. */
  @Public()
  @Get('docs/json')
  document() {
    return this.openapi.read();
  }
}
