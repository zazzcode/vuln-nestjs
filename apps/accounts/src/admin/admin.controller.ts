import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Roles } from '@zazzles/exchange-internal-auth';
import { render } from 'ejs';
import { Role, type User } from '../users/user.model.js';
import { UsersService } from '../users/users.service.js';

/** What an administrator creates an account with, over REST: a DTO, one salt per user. */
export class AdminCreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_ ]{1,80}$/, {
    message: 'A display name is 1 to 80 letters, digits, underscores or spaces',
  })
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

/**
 * The administration routes. The HTML page is rendered from a fixed template
 * with the data passed as data: the template escapes it, and the page carries
 * a content security policy that allows nothing.
 */
@Controller('internal/admin')
export class AdminController {
  constructor(private readonly users: UsersService) {}

  /** The users as data: JSON, with `nosniff`, so no browser reads it as anything else. */
  @Roles('ADMIN')
  @Get('users')
  async list(@Res({ passthrough: true }) reply: FastifyReply): Promise<User[]> {
    reply.header('x-content-type-options', 'nosniff');
    return this.users.all();
  }

  /** Creates an account: scrypt with a fresh salt, one per user, through the roles guard and a DTO. */
  @Roles('ADMIN')
  @Post('users')
  @HttpCode(201)
  create(@Body() dto: AdminCreateUserDto): Promise<User> {
    return this.users.create(dto);
  }

  /** The directory page: a fixed template, every value escaped by the template itself. */
  @Roles('ADMIN')
  @Get('directory')
  directory(@Res({ passthrough: true }) reply: FastifyReply) {
    return this.users.all().then((users) => {
      reply
        .header('content-type', 'text/html; charset=utf-8')
        .header('x-content-type-options', 'nosniff')
        .header(
          'content-security-policy',
          "default-src 'none'; style-src 'none'; script-src 'none'",
        )
        .send(
          render(
            [
              '<!DOCTYPE html><html><head><title>VCX directory</title></head><body>',
              '<h1>VCX directory</h1><table><tr><th>Name</th><th>Email</th></tr>',
              '<% for (const user of users) { %>',
              '<tr><td><%= user.displayName %></td><td><%= user.email %></td></tr>',
              '<% } %>',
              '</table></body></html>',
            ].join('\n'),
            { users },
          ),
        );
    });
  }
}
