import { Body, Controller, HttpCode, Injectable, Post } from '@nestjs/common';
import fetch from 'node-fetch';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { UsersService, toUser } from '../users/users.service.js';

/** What the avatar route accepts: a URL, nothing else. */
export interface AvatarUrl {
  url: string;
}

/**
 * The avatar import of the old profile page: it took a URL, fetched whatever
 * the URL named, and kept the URL on success.
 */
@Injectable()
@Controller('internal/profile')
export class LegacyAvatarController {
  constructor(private readonly users: UsersService) {}

  @Post('avatar')
  @HttpCode(200)
  async avatar(
    @CurrentUser() caller: TokenPayload,
    @Body() dto: AvatarUrl,
  ): Promise<{ stored: boolean; status?: number; user?: unknown }> {
    // SSRF-002 / CWE-918: the URL is fetched wherever it points — the
    // service's own loopback included — and redirects are followed to
    // wherever they lead (node-fetch's default)
    const response = await fetch(dto.url);
    if (!response.ok) {
      return { stored: false, status: response.status };
    }
    await this.users.update(caller.sub, { avatarUrl: dto.url });
    const account = await this.users.documentById(caller.sub);
    return { stored: true, status: response.status, user: toUser(account!) };
  }
}
