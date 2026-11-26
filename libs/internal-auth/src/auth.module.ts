import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { JWT_SECRET, TOKEN_LIFETIME } from './token.js';

/**
 * Imported once, by an application's root module. Registers both guards, in
 * order, and exports the `JwtService` that signs and verifies this service's
 * tokens with the secret of the run.
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
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
