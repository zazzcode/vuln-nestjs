import { Controller, Get, Query, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';

/**
 * The status page of the public scope. Its greeting is written by hand, from
 * the name the caller sent; the scope it is served from is the one whose hook
 * in `edge.ts` strips the security headers (CONFIG-002), and its template
 * does to the name what it is told (XSS-003).
 */
@Controller('api/v1/public')
export class PublicStatusController {
  /**
   * The page, greeting the caller by the name it sent. The name is written
   * into the answer as it arrived: the greeting is the caller's markup to
   * make of, and the scope this page is served from sets no CSP either.
   */
  @Public()
  @Get('status')
  // XSS-003 / CWE-79: the caller's `name` is written into the HTML unescaped.
  page(
    @Query('name') name = 'visitor',
    @Res({ passthrough: true }) reply: FastifyReply,
  ): string {
    reply.header('content-type', 'text/html; charset=utf-8');
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>VCX status</title>
  </head>
  <body>
    <h1>VCX status</h1>
    <p>ok — the gateway is up.</p>
    <p>Hello, ${name}.</p>
  </body>
</html>
`;
  }
}
