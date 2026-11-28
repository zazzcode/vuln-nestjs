import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Public, Roles } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The announcements of the notifications service. */
@Controller('api/v1')
export class AnnouncementsController {
  constructor(private readonly internal: InternalClientService) {}

  /** Every announcement. */
  @Public()
  @Get('announcements')
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/announcements',
    );
  }

  /** One announcement, as a page from an escaped template. */
  @Public()
  @Get('announcements/:id/page')
  page(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      `/internal/announcements/${encodeURIComponent(id)}/page`,
    );
  }

  /** One announcement, as HTML. */
  @Public()
  @Get('announcements/:id.html')
  html(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      `/internal/announcements/${encodeURIComponent(id)}/html`,
    );
  }

  /** One announcement. */
  @Public()
  @Get('announcements/:id')
  one(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      `/internal/announcements/${encodeURIComponent(id)}`,
    );
  }

  /** Publishes an announcement, from the typed input. */
  @Roles('ADMIN')
  @Post('admin/announcements')
  create(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/announcements',
    );
  }

  /** Publishes and sends an announcement, in process. */
  @Roles('ADMIN')
  @Post('admin/announcements/notify')
  notify(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/announcements/notify',
    );
  }

  /** Publishes and sends an announcement, the way the body asks. */
  @Roles('ADMIN')
  @Post('admin/announcements/send')
  send(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/announcements/send',
    );
  }
}
