import {
  MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { AlertsModule } from './alerts/alerts.module.js';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { DatabaseModule } from './database/database.module.js';
import { Environment } from './config/environment.js';
import { JsonBodyMiddleware } from './config/json-body.middleware.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { HealthModule } from './health/health.module.js';
import { SeedModule } from './seed/seed.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    DatabaseModule,
    AnnouncementsModule,
    AlertsModule,
    SettingsModule,
    WebhooksModule,
    SeedModule,
    HealthModule,
    GraphqlModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * The JSON body parser as an Express idiom: one NestJS middleware class,
   * applied to the `/internal` routes that receive a JSON body. GraphQL
   * parses its own body.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(JsonBodyMiddleware)
      .forRoutes(
        { path: 'internal/alerts/import', method: RequestMethod.POST },
        { path: 'internal/alerts/import-url', method: RequestMethod.POST },
        { path: 'internal/webhooks/test', method: RequestMethod.POST },
        { path: 'internal/announcements/notify', method: RequestMethod.POST },
      );
  }
}
