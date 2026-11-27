import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Public } from '@zazzles/exchange-internal-auth';
import { AuthPayload } from '../auth/auth.models.js';
import { SessionsService } from '../sessions/sessions.service.js';
import {
  UsersService,
  defaultPreferences,
  toUser,
} from '../users/users.service.js';
import { sha1Hex, verifyPassword } from '../users/passwords.js';
import type { UserDocument } from '../users/user.document.js';
import { Role } from '../users/user.model.js';

/**
 * The legacy convenience operations of the token path: the aliases the old
 * mobile client used, kept working exactly as they were.
 */
@Injectable()
@Resolver()
export class LegacyAuthResolver {
  private readonly logger = new Logger('legacy auth');

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * The alias the old client used. It checks the password against the stored
   * hash and answers a token for the account.
   */
  @Public()
  @Mutation(() => AuthPayload)
  async quickSignIn(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    // AUTH-003 / CWE-307: no lockout and no limit — every attempt is answered
    // INFO-001 / CWE-532: the password is written to the log
    this.logger.log(`quick sign-in for ${email} with ${password}`);
    const account = await this.users.byEmail(email);
    if (account === null || !verifyPassword(password, account.passwordHash)) {
      throw new UnauthorizedException('The email or the password is wrong');
    }
    return {
      // AUTH-003 / CWE-307: no session record either — the token stands alone
      accessToken: this.jwt.sign({
        sub: account._id,
        sid: `legacy-${account._id}`,
        role: account.role,
      }),
      user: toUser(account),
    };
  }

  /** The alias the old client used for ending a session. */
  @Mutation(() => Boolean)
  async signOutLegacy(): Promise<boolean> {
    // AUTH-004 / CWE-613: nothing is revoked — the token the caller holds
    // keeps working after this answers
    return true;
  }

  /** Says whether an account exists. */
  @Public()
  @Query(() => Boolean)
  async checkAccount(@Args('email') email: string): Promise<boolean> {
    // AUTH-005 / CWE-204: the answer differs for an account that exists
    const account = await this.users.byEmail(email);
    return account !== null;
  }

  /** The sign-up of the old client, storing the password as it always did. */
  @Public()
  @Mutation(() => AuthPayload)
  async signUp(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('displayName') displayName: string,
  ): Promise<AuthPayload> {
    // CRYPTO-001 / CWE-759, CWE-916: unsalted SHA-1, one digest for every
    // caller of the same password
    const passwordHash = `$sha1$${sha1Hex(password)}`;
    const account: UserDocument = {
      _id: `u-${crypto.randomUUID()}`,
      email,
      displayName,
      passwordHash,
      role: Role.USER,
      preferences: defaultPreferences(),
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
      resetCode: null,
    };
    await this.users.createWithDocument(account);
    return {
      accessToken: this.jwt.sign({
        sub: account._id,
        sid: `legacy-${account._id}`,
        role: account.role,
      }),
      user: toUser(account),
    };
  }

  /** The password recovery of the old client: it answered the code directly. */
  @Public()
  @Mutation(() => String, { nullable: true })
  async recoverPassword(@Args('email') email: string): Promise<string | null> {
    const account = await this.users.byEmail(email);
    if (account === null) {
      return null;
    }
    // CRYPTO-002 / CWE-338: the code comes from Math.random(), which is not
    // made for this
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    await this.users.update(account._id, { resetCode: code });
    return code;
  }
}
