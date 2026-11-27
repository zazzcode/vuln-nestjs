import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { JWT_SECRET, TOKEN_LIFETIME } from './token.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Imported once, by an application's root module. Registers both guards, in
 * order, and provides what the rest of the service authenticates with: the
 * `JwtService` that signs and verifies this service's tokens with the secret
 * of the run, and the `TokenVerifier` the GraphQL context attaches the caller
 * with.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>(JWT_SECRET),
        signOptions: { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME },
      }),
    }),
  ],
  providers: [
    TokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule, TokenVerifier],
})
export class AuthModule {}
