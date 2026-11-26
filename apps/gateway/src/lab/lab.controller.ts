import { Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '@zazzles/exchange-internal-auth';
import { LabService } from './lab.service.js';

/** The lab's own endpoints: one that says whether everything is up, one that returns every store to the fake data. */
@Controller('api/v1')
export class LabController {
  constructor(private readonly lab: LabService) {}

  /** Every backend service and its store. No versions and no environment values: this page is open. */
  @Public()
  @Get('health')
  async health(@Res({ passthrough: true }) response: FastifyReply) {
    const health = await this.lab.health();
    if (health.status !== 'ok') {
      response.status(503);
    }
    return health;
  }

  /** Lab tooling, open by design. Anyone running the lab may start again from the fake data. */
  @Public()
  @HttpCode(200)
  @Post('lab/reset')
  reset() {
    return this.lab.reset();
  }
}
