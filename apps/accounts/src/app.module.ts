import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { DatabaseModule } from './database/database.module.js';
import { Environment } from './config/environment.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { HealthModule } from './health/health.module.js';
import { SeedModule } from './seed/seed.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    DatabaseModule,
    UsersModule,
    SeedModule,
    HealthModule,
    GraphqlModule,
  ],
})
export class AppModule {}
