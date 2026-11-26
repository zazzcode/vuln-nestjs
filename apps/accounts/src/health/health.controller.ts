import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Public, ServiceToken } from '@zazzles/exchange-internal-auth';
import { MongoStore } from '../database/mongo.store.js';
import { SeedService } from '../seed/seed.service.js';

/** The two endpoints every backend service serves: one that says it is up, one that returns its store to the fake data. */
@Controller('internal')
export class HealthController {
  constructor(
    private readonly store: MongoStore,
    private readonly seed: SeedService,
  ) {}

  /** Open: the start command reads it, and holds no credential. */
  @Public()
  @Get('health')
  async health() {
    return {
      status: 'ok',
      service: 'accounts',
      store: { engine: 'mongodb', connected: await this.store.isConnected() },
    };
  }

  /** Destructive, so it answers only to the system. The gateway's `/api/v1/lab/reset` calls it. */
  @ServiceToken()
  @HttpCode(200)
  @Post('lab/reset')
  async reset() {
    await this.seed.load();
    return { status: 'ok', service: 'accounts' };
  }
}
