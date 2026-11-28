import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's documents in the accounts service. */
@Controller('api/v1/profile/documents')
export class DocumentsController {
  constructor(private readonly internal: InternalClientService) {}

  /** Stores a document, behind the service's own checks. */
  @Post('checked')
  checked(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/documents/checked',
    );
  }

  /** Stores a document. */
  @Post()
  upload(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/documents',
    );
  }

  /** Stores a document the old way. */
  @Post('legacy')
  legacy(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/documents/legacy',
    );
  }

  /** Every document of the caller's. */
  @Get()
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/documents',
    );
  }

  /** A document by the name it was stored under. */
  @Get('by-name/:name')
  byName(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('name') name: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/by-name/${encodeURIComponent(name)}`,
    );
  }

  /** A file, as the service stored it. */
  @Get('file/:name')
  file(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('name') name: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/file/${encodeURIComponent(name)}`,
    );
  }

  /** A file, served as HTML. */
  @Get('file/:name/view')
  fileView(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('name') name: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/file/${encodeURIComponent(name)}/view`,
    );
  }

  /** One document of the caller's. */
  @Get(':id')
  one(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/${encodeURIComponent(id)}`,
    );
  }

  /** A document, served for reading. */
  @Get(':id/view')
  view(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/${encodeURIComponent(id)}/view`,
    );
  }

  /** A document, served as its bytes. */
  @Get(':id/image')
  image(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      `/internal/documents/${encodeURIComponent(id)}/image`,
    );
  }
}
