import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public, ServiceToken } from '@zazzles/exchange-internal-auth';
import { SeedService } from '../seed/seed.service.js';

/** The two endpoints every backend service serves: one that says it is up, one that returns its store to the fake data. */
@Controller('internal')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly seed: SeedService,
  ) {}

  /** Open: the start command reads it, and holds no credential. */
  @Public()
  @Get('health')
  async health() {
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      service: 'trading',
      store: { engine: 'mysql', connected: this.dataSource.isInitialized },
    };
  }

  /** Destructive, so it answers only to the system. The gateway's `/api/v1/lab/reset` calls it. */
  @ServiceToken()
  @HttpCode(200)
  @Post('lab/reset')
  async reset() {
    await this.seed.load();
    return { status: 'ok', service: 'trading' };
  }
}
