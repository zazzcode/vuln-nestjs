import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthResolver } from './auth.resolver.js';
import { AuthController } from './auth.controller.js';
import { TokenKeys } from './token-keys.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';

/** Sign-in, sessions and the token routes, all of them the safe counterparts of Step 2a's weak auth paths. */
@Module({
  imports: [SessionsModule, UsersModule],
  providers: [AuthResolver, TokenKeys],
  controllers: [AuthController],
})
export class AuthFeatureModule {}
