import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  CurrentUser,
  Public,
  Roles,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { AuthPayload, Session } from './auth.models.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService, toUser } from '../users/users.service.js';
import { User } from '../users/user.model.js';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  /** Open. Locks the account for a minute after five failures, and answers a wrong email and a wrong password the same way. */
  @Public()
  @Mutation(() => AuthPayload)
  signIn(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    return this.sessions.signIn(email, password);
  }

  /** The caller's profile, from the verified token: there is nothing else to ask for. */
  @Query(() => User, { name: 'me' })
  async me(@CurrentUser() caller: TokenPayload) {
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new Error('No such account');
    }
    return toUser(account);
  }

  /** The caller's session, the one the token carries. */
  @Query(() => Session, { nullable: true })
  async sessionInfo(
    @CurrentUser() caller: TokenPayload,
  ): Promise<Session | null> {
    return toSession(await this.sessions.byId(caller.sid));
  }

  /** The caller's sessions. */
  @Query(() => [Session], { name: 'sessions' })
  async sessionsOf(@CurrentUser() caller: TokenPayload): Promise<Session[]> {
    return (await this.sessions.ofUser(caller.sub))
      .map(toSession)
      .filter((session): session is Session => session !== null);
  }

  /** Ends the session the token carries. The token works nowhere after. */
  @Mutation(() => Boolean)
  async signOut(@CurrentUser() caller: TokenPayload): Promise<boolean> {
    await this.sessions.revoke(caller.sid);
    return true;
  }

  /** Ends one of the caller's own sessions, and nobody else's. */
  @Mutation(() => Boolean)
  async deleteSession(
    @CurrentUser() caller: TokenPayload,
    @Args('id') id: string,
  ): Promise<boolean> {
    const session = await this.sessions.byId(id);
    if (session === null || session.userId !== caller.sub) {
      return false;
    }
    await this.sessions.revoke(id);
    return true;
  }

  @Mutation(() => Boolean)
  changePassword(
    @CurrentUser() caller: TokenPayload,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ): Promise<boolean> {
    return this.sessions.changePassword(
      caller.sub,
      currentPassword,
      newPassword,
    );
  }

  /** Open, and one answer whether or not the account exists. */
  @Public()
  @Mutation(() => Boolean)
  requestPasswordReset(@Args('email') email: string): Promise<boolean> {
    return this.sessions.requestPasswordReset(email);
  }

  /** A new password from `crypto`'s randomness, handed to the administrator once. */
  @Roles('ADMIN')
  @Mutation(() => String)
  resetPassword(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<string> {
    return this.sessions.resetPassword(userId);
  }
}

/** The stored `_id` is the session's `id`. */
function toSession(
  document: {
    _id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
  } | null,
): Session | null {
  return document === null
    ? null
    : {
        id: document._id,
        userId: document.userId,
        createdAt: document.createdAt,
        expiresAt: document.expiresAt,
      };
}
