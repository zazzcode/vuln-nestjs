import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';
import { UsersModule } from '../users/users.module.js';

/**
 * The session records, and the guard that enforces them. Registered right
 * after the authentication module's guards, so a revoked session is refused
 * wherever a token is accepted.
 */
@Global()
@Module({
  imports: [UsersModule],
  providers: [
    SessionsRepository,
    SessionsService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionsRepository, SessionsService],
})
export class SessionsModule {}
