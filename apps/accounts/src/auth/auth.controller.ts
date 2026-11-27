import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Post,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { IsString, MinLength } from 'class-validator';
import {
  CurrentUser,
  Public,
  SESSION_COOKIE,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import { TokenKeys } from './token-keys.js';

/** What a typed sign-in carries. Strings only: an object here is refused before any query is built. */
export class SignInDto {
  @IsString()
  @MinLength(3)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** What the resume cookie holds, once parsed: nothing else is accepted. */
export class ResumeSettingsDto {
  @IsString()
  @MinLength(3)
  userId!: string;

  @IsString()
  theme?: string;
}

const REMEMBER_COOKIE = 'vcx_remember';

/**
 * Logs a sign-in without its password: the email and fixed strings are all
 * that reach the logger, and no other field of the body is read. It runs
 * last, over the whole route.
 */
@Injectable()
export class RedactSecretsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('sessions');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      body?: Record<string, unknown>;
    }>();
    const body = request.body === undefined ? {} : request.body;
    const email =
      typeof body.email === 'string' ? body.email : 'an unknown email';
    this.logger.log(`sign-in attempted as ${email}`);
    return next.handle().pipe(
      map((value) => {
        this.logger.log('sign-in answered');
        return value;
      }),
    );
  }
}

/** The session routes the gateway calls on a client's behalf. */
@Controller('internal/sessions')
export class AuthController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
    private readonly keys: TokenKeys,
  ) {}

  /**
   * Open. Credentials through a DTO of strings, ten attempts a minute: the
   * typed counterpart of every weak sign-in route. The limit is applied by
   * the platform module, which names this route: a limit declared on the
   * route itself is never read.
   */
  @Public()
  @UseInterceptors(RedactSecretsInterceptor)
  @Post('typed')
  @HttpCode(200)
  async typed(
    @Body() credentials: SignInDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, user } = await this.sessions.signIn(
      credentials.email,
      credentials.password,
    );
    reply.setCookie(SESSION_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    return { accessToken, user };
  }

  /** Open, the credentials the same way, answered with a signed cookie. */
  @Public()
  @Post('signed')
  @HttpCode(200)
  async signed(
    @Body() credentials: SignInDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { accessToken, user } = await this.sessions.signIn(
      credentials.email,
      credentials.password,
    );
    reply.setCookie(SESSION_COOKIE, accessToken, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { user, session: accessToken.slice(-8) };
  }

  /**
   * What a token stands for: the signature verifies and the session record
   * decides. A closed operation — the caller must hold a live token of its own.
   */
  @Post('introspect')
  @HttpCode(200)
  introspect(@Body('token') token: string) {
    return this.sessions.introspect(token);
  }

  /** Ends the caller's session and clears the cookie. */
  @Post('revoke')
  @HttpCode(200)
  async revoke(
    @CurrentUser() caller: TokenPayload,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.sessions.revoke(caller.sid);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { revoked: true };
  }

  /**
   * Open. Resumes from a cookie this service signed: the signature is checked
   * before the value is parsed, and what parses is validated against a DTO.
   */
  @Public()
  @Post('resume')
  @HttpCode(200)
  async resume(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ accessToken: string }> {
    const raw = reply.request.cookies?.[REMEMBER_COOKIE];
    const unsigned =
      raw === undefined ? undefined : reply.request.unsignCookie(raw);
    const settings =
      unsigned?.valid && typeof unsigned.value === 'string'
        ? parseResumeSettings(unsigned.value)
        : null;
    const account =
      settings === null ? null : await this.users.documentById(settings.userId);
    if (account === null) {
      reply.code(400);
      return { accessToken: '' };
    }
    const session = await this.sessions.startSession(account);
    return { accessToken: session.accessToken };
  }

  /** Open. The public key of the run's token key pair, for anyone to read. */
  @Public()
  @Get('public-key')
  publicKey(): { alg: string; publicKey: string } {
    return { alg: 'RS256', publicKey: this.keys.publicKey };
  }
}

/** Parses and validates what the resume cookie holds. `null` when it is not the shape this route resumes. */
function parseResumeSettings(value: string): ResumeSettingsDto | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const { userId, theme } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length < 3) {
    return null;
  }
  if (theme !== undefined && typeof theme !== 'string') {
    return null;
  }
  return { userId, theme };
}
