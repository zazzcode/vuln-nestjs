import { Body, Controller, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { UsersService, toUser } from '../users/users.service.js';
import { AvatarClient } from './avatar.client.js';

/** What the profile route accepts. The whitelist is on: a field the DTO does not declare is refused, not ignored. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** The avatar fetch's body: a URL. */
export class AvatarFetchDto {
  @IsString()
  url!: string;
}

@Controller('internal/profile')
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarClient,
  ) {}

  /**
   * Changes the caller's own profile. Each field is copied by name from the
   * validated DTO: there is no property a caller could add that this route
   * would carry to the record.
   */
  @Put()
  async update(
    @CurrentUser() caller: TokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const changes: Record<string, string> = {};
    if (dto.displayName !== undefined) {
      changes.displayName = dto.displayName;
    }
    if (dto.email !== undefined) {
      changes.email = dto.email;
    }
    await this.users.update(caller.sub, changes);
    const account = await this.users.documentById(caller.sub);
    return toUser(account!);
  }

  /**
   * Fetches an avatar from an allowlisted origin, with redirects refused, and
   * stores the URL on success. It is the counterpart of every fetch-what-you-
   * are-given route: the allowlist is checked before anything is fetched.
   */
  @Post('avatar/fetch')
  @HttpCode(200)
  async fetchAvatar(
    @CurrentUser() caller: TokenPayload,
    @Body() dto: AvatarFetchDto,
  ) {
    const result = await this.avatars.fetch(dto.url);
    if (!result.ok) {
      return {
        stored: false,
        reason: 'The avatar URL is not on the allowlist',
      };
    }
    await this.users.update(caller.sub, { avatarUrl: dto.url });
    const account = await this.users.documentById(caller.sub);
    return { stored: true, user: toUser(account!) };
  }
}
