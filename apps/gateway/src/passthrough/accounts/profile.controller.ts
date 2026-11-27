import { Controller, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's own profile in the accounts service. */
@Controller('api/v1/profile')
export class ProfileController {
  constructor(private readonly internal: InternalClientService) {}

  /** Replaces the profile's typed fields. */
  @Put()
  update(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/profile',
    );
  }

  /** Changes the typed fields the body names. */
  @Patch()
  patch(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/profile',
    );
  }

  /** Takes the avatar at a URL, behind the service's outbound guard. */
  @Post('avatar/fetch')
  fetchAvatar(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/profile/avatar/fetch',
    );
  }

  /** Takes an avatar as the body of the request. */
  @Post('avatar')
  avatar(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/profile/avatar',
    );
  }
}
