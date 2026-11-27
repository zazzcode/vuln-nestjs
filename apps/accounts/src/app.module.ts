import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { DatabaseModule } from './database/database.module.js';
import { Environment } from './config/environment.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { HealthModule } from './health/health.module.js';
import { SeedModule } from './seed/seed.module.js';
import { PlatformModule } from './platform.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthFeatureModule } from './auth/auth.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { AdminModule } from './admin/admin.module.js';
import { LegacyModule } from './legacy/legacy.module.js';

// The order is load-bearing: the authentication module's guards come first,
// then the session guard that refuses revoked tokens, then the features.
@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    DatabaseModule,
    PlatformModule,
    SessionsModule,
    UsersModule,
    AuthFeatureModule,
    ProfileModule,
    DocumentsModule,
    AdminModule,
    LegacyModule,
    SeedModule,
    HealthModule,
    GraphqlModule,
  ],
})
export class AppModule {}
