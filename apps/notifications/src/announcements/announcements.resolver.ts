import { Parent, Query, ResolveReference, Resolver } from '@nestjs/graphql';
import { Public } from '@zazzles/exchange-internal-auth';
import { Announcement } from './announcement.model.js';
import { AnnouncementsService } from './announcements.service.js';

@Resolver(() => Announcement)
export class AnnouncementsResolver {
  constructor(private readonly announcements: AnnouncementsService) {}

  /** Every announcement. Anyone may read them. */
  @Public()
  @Query(() => [Announcement], { name: 'announcements' })
  all(): Promise<Announcement[]> {
    return this.announcements.all();
  }

  /** The gateway asks for an announcement by key. */
  @ResolveReference()
  reference(@Parent() reference: { id: string }): Promise<Announcement | null> {
    return this.announcements.byId(Number(reference.id));
  }
}
