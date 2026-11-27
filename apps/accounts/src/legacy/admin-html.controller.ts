import { Controller, Get, Injectable } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { Res } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

/**
 * The user list of the old administration console: one HTML page, built the
 * way the console's first version built it.
 */
@Injectable()
@Roles('ADMIN')
@Controller('internal/admin')
export class AdminHtmlController {
  constructor(private readonly users: UsersService) {}

  @Get('users-html')
  async usersHtml(@Res({ passthrough: true }) reply: FastifyReply) {
    const users = await this.users.all();
    // XSS-004 / CWE-79: every value goes into the page as it is stored — a
    // display name that carries markup is rendered as markup
    const rows = users
      .map(
        (user) => `<tr><td>${user.displayName}</td><td>${user.email}</td></tr>`,
      )
      .join('');
    reply.header('content-type', 'text/html');
    return `<!DOCTYPE html><html><body><table>${rows}</table></body></html>`;
  }
}
