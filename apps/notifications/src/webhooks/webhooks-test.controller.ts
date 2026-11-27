import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { IsString, MaxLength } from 'class-validator';
import { DeliveryService } from './delivery.service.js';

/** The body of a webhook test: the URL to send one delivery to. */
export class WebhookTestBody {
  @IsString()
  @MaxLength(2000)
  url: string;
}

/** One delivery to a URL the caller names, through the outbound guard. */
@Controller('internal/webhooks')
export class WebhooksTestController {
  constructor(private readonly deliveries: DeliveryService) {}

  @Post('test')
  @HttpCode(200)
  test(
    @UserId() caller: string,
    @Body() body: WebhookTestBody,
  ): ReturnType<DeliveryService['deliverTo']> {
    return this.deliveries.deliverTo(
      { alertId: null, userId: caller, url: body.url },
      { event: 'webhook-test', url: body.url },
    );
  }
}
