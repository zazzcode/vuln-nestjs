import { Module } from '@nestjs/common';
import { Environment } from '../config/environment.js';
import { OutboundGuardService } from './outbound-guard.service.js';

/**
 * The outbound guard on its own, built from the environment's allowlist, so
 * that the settings module and the webhooks module share one guard without
 * importing each other.
 */
@Module({
  providers: [
    {
      provide: OutboundGuardService,
      useFactory: (environment: Environment) =>
        new OutboundGuardService(environment.webhookOrigins),
      inject: [Environment],
    },
  ],
  exports: [OutboundGuardService],
})
export class OutboundGuardModule {}
