import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  CurrentUser,
  Roles,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { AnnouncementInput } from './announcement.input.js';
import { Announcement } from './announcement.model.js';
import { AnnouncementsService } from './announcements.service.js';
import { NotifierService } from './notifier.service.js';
import { DeliveryService } from '../webhooks/delivery.service.js';

/**
 * Broadcasts an announcement: stores it with `sentAt`, and sends each
 * recipient the notice rendered from the fixed template, through the notifier
 * command run with a fixed argument vector.
 */
@Resolver()
export class BroadcastAnnouncementResolver {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly notifier: NotifierService,
    private readonly deliveries: DeliveryService,
  ) {}

  /** An administrator's operation: it reaches every recipient at once. */
  @Roles('ADMIN')
  @Mutation(() => Announcement, { name: 'broadcastAnnouncement' })
  async broadcast(
    @CurrentUser() caller: TokenPayload,
    @Args('input', { type: () => AnnouncementInput }) input: AnnouncementInput,
  ): Promise<Announcement> {
    const announcement = await this.announcements.create(caller.sub, input);
    await this.deliveries.toRecipients(async (_settings, url) => ({
      url,
      ...(await this.notifier.sendWithVector(input, url)),
    }));
    return announcement;
  }
}
