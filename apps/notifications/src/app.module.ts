import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { DatabaseModule } from './database/database.module.js';
import { Environment } from './config/environment.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { HealthModule } from './health/health.module.js';
import { SeedModule } from './seed/seed.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    DatabaseModule,
    AnnouncementsModule,
    SeedModule,
    HealthModule,
    GraphqlModule,
  ],
})
export class AppModule {}
