import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  CurrentUser,
  Roles,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { AnnouncementInput } from './announcement.input.js';
import { plainNotice } from './notice.service.js';
import { AnnouncementsService } from './announcements.service.js';
import { DeliveryService } from '../webhooks/delivery.service.js';
import { WebhookClientService } from '../webhooks/webhook-client.service.js';

/** Sends an announcement as plain text, in process: no template engine, no process. */
@Controller('internal/announcements')
export class AnnouncementsNotifyController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly deliveries: DeliveryService,
    private readonly client: WebhookClientService,
  ) {}

  /** An administrator's operation. `201` with the announcement and the delivery records. */
  @Roles('ADMIN')
  @Post('notify')
  @HttpCode(201)
  async notify(
    @CurrentUser() caller: TokenPayload,
    @Body() input: AnnouncementInput,
  ) {
    const announcement = await this.announcements.create(caller.sub, input);
    const records = await this.deliveries.toRecipients(
      async (_settings, url) => {
        const attempt = await this.client.post(url, {
          title: input.title,
          notice: plainNotice(input),
        });
        return { url, ...WebhookClientService.outcomeOf(attempt) };
      },
    );
    return { announcement, deliveries: records };
  }
}
