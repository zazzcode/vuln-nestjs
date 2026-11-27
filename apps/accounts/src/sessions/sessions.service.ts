import {
  HttpException,
  Injectable,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'node:crypto';
import {
  TOKEN_LIFETIME,
  type Role,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import type { SessionDocument } from './session.document.js';
import { SessionsRepository } from './sessions.repository.js';
import type { UserDocument } from '../users/user.document.js';
import { UsersRepository } from '../users/users.repository.js';
import { scryptHash, verifyPassword } from '../users/passwords.js';
import { toUser } from '../users/users.service.js';
import type { User } from '../users/user.model.js';

/** Five failed sign-ins lock an account for a minute. */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 60_000;

/** One message for every failed sign-in, whatever was wrong. */
const WRONG_CREDENTIALS = 'The email or the password is wrong';

@Injectable()
export class SessionsService {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Verifies a sign-in: the account must exist, must not be locked, and the
   * password must match. The filter is built field by field from scalars, and
   * the answer is the same whether the email or the password was wrong.
   */
  async signIn(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: User }> {
    const account = await this.users.findByEmail(email);
    if (account === null) {
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    if (account.lockedUntil !== null && account.lockedUntil > new Date()) {
      throw new HttpException(
        'The account is locked after repeated failed sign-ins',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!verifyPassword(password, account.passwordHash)) {
      const failedAttempts = account.failedAttempts + 1;
      await this.users.update(account._id, {
        failedAttempts,
        ...(failedAttempts >= LOCKOUT_THRESHOLD
          ? { lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
          : {}),
      });
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    await this.users.update(account._id, {
      failedAttempts: 0,
      lockedUntil: null,
    });
    return this.startSession(account);
  }

  /** Creates the session record and the token that carries it. */
  async startSession(
    account: UserDocument,
  ): Promise<{ accessToken: string; user: User }> {
    const sid = `s-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await this.sessions.insert({
      _id: sid,
      userId: account._id,
      revokedAt: null,
      expiresAt,
      createdAt: new Date(),
    });
    return {
      accessToken: this.tokenFor(account._id, sid, account.role),
      user: toUser(account),
    };
  }

  /** A token as this service signs them: HS256, the claims the guard reads. */
  tokenFor(sub: string, sid: string, role: Role): string {
    const claims: TokenPayload = { sub, sid, role };
    return this.jwt.sign(claims);
  }

  async revoke(sid: string, at = new Date()): Promise<void> {
    await this.sessions.revoke(sid, at);
  }

  async byId(sid: string): Promise<SessionDocument | null> {
    return this.sessions.find(sid);
  }

  ofUser(userId: string): Promise<SessionDocument[]> {
    return this.sessions.ofUser(userId);
  }

  /**
   * What a token stands for, when its signature verifies and its session is
   * live. Anything else is inactive, with no detail about why.
   */
  async introspect(token: string): Promise<{
    active: boolean;
    sub?: string;
    sid?: string;
    role?: Role;
    expiresAt?: string;
  }> {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        algorithms: ['HS256'],
      });
      const session = await this.sessions.find(payload.sid);
      if (
        !session ||
        session.revokedAt !== null ||
        session.expiresAt < new Date()
      ) {
        return { active: false };
      }
      return {
        active: true,
        sub: payload.sub,
        sid: payload.sid,
        role: payload.role,
        expiresAt: session.expiresAt.toISOString(),
      };
    } catch {
      return { active: false };
    }
  }

  /** Changes the password of a signed-in caller. The current one must match. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const account = await this.users.findById(userId);
    if (
      account === null ||
      !verifyPassword(currentPassword, account.passwordHash)
    ) {
      throw new UnauthorizedException('The current password is wrong');
    }
    await this.users.update(userId, { passwordHash: scryptHash(newPassword) });
    return true;
  }

  /**
   * Registers a password request. The answer is the same whether or not the
   * account exists, and the code never leaves the record: it comes from
   * `crypto.randomInt`, and only email delivery, which this lab does not have,
   * would carry it to a mailbox.
   */
  async requestPasswordReset(email: string): Promise<boolean> {
    const account = await this.users.findByEmail(email);
    if (account !== null) {
      const resetCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.users.update(account._id, { resetCode });
    }
    return true;
  }

  /** A new password for an account, from `crypto.randomBytes`. The administrator sees it once. */
  async resetPassword(userId: string): Promise<string> {
    const account = await this.users.findById(userId);
    if (account === null) {
      throw new HttpException('No such account', HttpStatus.NOT_FOUND);
    }
    const password = crypto.randomUUID().replace(/-/g, '');
    await this.users.update(userId, { passwordHash: scryptHash(password) });
    return password;
  }
}

/** How long a token lives: re-exported for the controllers that set cookies. */
export { TOKEN_LIFETIME };
