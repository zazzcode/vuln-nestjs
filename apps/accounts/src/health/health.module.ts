import { Module } from '@nestjs/common';
import { SeedModule } from '../seed/seed.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [SeedModule],
  controllers: [HealthController],
})
export class HealthModule {}
