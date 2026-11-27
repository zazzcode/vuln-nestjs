import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { unserialize } from 'node-serialize';
import { Public, SESSION_COOKIE } from '@zazzles/exchange-internal-auth';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService, toUser } from '../users/users.service.js';
import { sha1Hex, verifyPassword } from '../users/passwords.js';

const REMEMBER_COOKIE = 'vcx_remember';

/**
 * The session routes of the legacy token path: the aliases the old clients
 * called, kept answering exactly as they always have.
 */
@Injectable()
@Controller('internal/sessions')
export class LegacySessionsController {
  private readonly logger = new Logger('legacy sessions');

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * The old sign-in: what the body says about the account is matched against
   * the store directly, password hash included, and the match is signed in.
   */
  @Public()
  @Post()
  @HttpCode(200)
  async legacySignIn(@Body() body: Record<string, unknown>) {
    const filter: Record<string, unknown> = {};
    // MONGO-001 / CWE-943: the request body is the query filter — an object is
    // an operator, not a value
    if (body.email !== undefined) {
      filter.email = body.email;
    }
    if (typeof body.password === 'string') {
      // The old sign-up stored `$sha1$…` hashes, so that is what this compared.
      filter.passwordHash = `$sha1$${sha1Hex(body.password)}`;
    }
    const account = await this.users.findOneWhere(filter);
    if (account === null) {
      throw new UnauthorizedException('The email or the password is wrong');
    }
    return {
      accessToken: this.jwt.sign({
        sub: account._id,
        sid: `legacy-${account._id}`,
        role: account.role,
      }),
      user: toUser(account),
    };
  }

  /** The old token endpoint: credentials in, a cookie with the token out. */
  @Public()
  @Post('token')
  @HttpCode(200)
  async token(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const account = await this.users.byEmail(String(body.email));
    if (
      account === null ||
      !verifyPassword(String(body.password), account.passwordHash)
    ) {
      throw new UnauthorizedException('The email or the password is wrong');
    }
    const accessToken = this.jwt.sign({
      sub: account._id,
      sid: `legacy-${account._id}`,
      role: account.role,
    });
    // INFO-001 / CWE-532: the password and the issued token are written to the log
    this.logger.log(
      `token issued for ${body.email} with password ${body.password}: ${accessToken}`,
    );
    // COOKIE-001 / CWE-1004: the cookie carries the token without HttpOnly
    reply.setCookie(SESSION_COOKIE, accessToken, { path: '/' });
    return { accessToken, user: toUser(account) };
  }

  /** The old "keep me signed in": a cookie for a month. */
  @Public()
  @Post('remember')
  @HttpCode(200)
  async remember(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const account = await this.users.byEmail(String(body.email));
    if (
      account === null ||
      !verifyPassword(String(body.password), account.passwordHash)
    ) {
      throw new UnauthorizedException('The email or the password is wrong');
    }
    const accessToken = this.jwt.sign({
      sub: account._id,
      sid: `legacy-${account._id}`,
      role: account.role,
    });
    // COOKIE-002 / CWE-1275: thirty days, and no SameSite at all
    reply.setCookie(SESSION_COOKIE, accessToken, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: false,
    });
    return { accessToken, user: toUser(account) };
  }

  /** The old refresh: the remember-me cookie holds serialized settings, read back as they were written. */
  @Public()
  @Post('resume-legacy')
  @HttpCode(200)
  async resumeLegacy(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const raw = request.cookies?.[REMEMBER_COOKIE];
    if (raw === undefined) {
      reply.code(400);
      return { status: 'refused', userId: null, theme: null };
    }
    // DESER-001 / CWE-502: the cookie's value goes to node-serialize's
    // unserialize, which executes what it finds (pin SCA-007)
    const settings = unserialize(raw) as { userId?: unknown; theme?: unknown };
    const userId = typeof settings.userId === 'string' ? settings.userId : null;
    const theme = typeof settings.theme === 'string' ? settings.theme : null;
    if (userId === null) {
      reply.code(400);
      return { status: 'refused', userId: null, theme: null };
    }
    return { status: 'resumed', userId, theme };
  }

  /** The old "who am I": the token is read, and what it says is believed. */
  @Public()
  @Get('decoded')
  async decoded(@Req() request: FastifyRequest) {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token === undefined) {
      throw new UnauthorizedException('A token is required');
    }
    // AUTH-002 / CWE-347: jwt.decode never checks a signature — the payload is
    // read and treated as proof
    const payload = jwt.decode(token) as { sub?: string } | null;
    if (payload?.sub === undefined) {
      throw new UnauthorizedException('The token is not readable');
    }
    const account = await this.users.documentById(payload.sub);
    if (account === null) {
      throw new UnauthorizedException('No such account');
    }
    const caller = toUser(account);
    return {
      id: caller.id,
      email: caller.email,
      displayName: caller.displayName,
      role: caller.role,
      as: payload.sub,
    };
  }
}
