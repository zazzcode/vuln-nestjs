import { Controller, Get } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DeliveriesRepository } from './deliveries.repository.js';

/**
 * The caller's delivery records, whole: `responseBody` included, which the
 * graph does not carry, because what a receiver answered is the evidence
 * several suites read.
 */
@Controller('internal/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesRepository) {}

  @Get()
  of(@UserId() caller: string): Promise<unknown[]> {
    return this.deliveries.findByUserId(caller);
  }
}
