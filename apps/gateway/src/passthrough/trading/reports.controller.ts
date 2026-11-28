import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's reports in the trading service. */
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly internal: InternalClientService) {}

  /** Every report of the caller's. */
  @Get()
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/reports',
    );
  }

  /** The trades, as a spreadsheet. */
  @Get('trades.csv')
  tradesCsv(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/reports/trades.csv',
    );
  }

  /** The trades, as JSON. */
  @Get('trades.json')
  tradesJson(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/reports/trades.json',
    );
  }

  /** The trades, as the service wrote the sheet itself. */
  @Get('trades-raw.csv')
  tradesRawCsv(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/reports/trades-raw.csv',
    );
  }

  /** A report file, from the checked directory. */
  @Get('file/:name')
  file(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('name') name: string,
  ) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      `/internal/reports/file/${encodeURIComponent(name)}`,
    );
  }

  /** A report file, from wherever the path names. */
  @Get('files/:name')
  files(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('name') name: string,
  ) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      `/internal/reports/files/${encodeURIComponent(name)}`,
    );
  }

  /** One report of the caller's. */
  @Get(':id')
  one(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      `/internal/reports/${encodeURIComponent(id)}`,
    );
  }
}
