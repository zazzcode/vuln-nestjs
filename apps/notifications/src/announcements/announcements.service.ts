import { Injectable } from '@nestjs/common';
import type { AnnouncementEntity } from './announcement.entity.js';
import { type Announcement } from './announcement.model.js';
import { AnnouncementsRepository } from './announcements.repository.js';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly repository: AnnouncementsRepository) {}

  async all(): Promise<Announcement[]> {
    return (await this.repository.findAll()).map(toAnnouncement);
  }

  /** One announcement, or nothing when there is none. */
  async byId(id: number): Promise<Announcement | null> {
    const row = await this.repository.findById(id);
    return row === null ? null : toAnnouncement(row);
  }
}

function toAnnouncement(row: AnnouncementEntity): Announcement {
  return {
    id: String(row.id),
    title: row.title,
    body: row.body,
    authorId: row.authorId,
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? null,
  };
}
