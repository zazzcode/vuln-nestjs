import { labStart } from '@zazzles/exchange-lab-data';
import type { AnnouncementEntity } from './announcement.entity.js';
import type { AnnouncementsRepository } from './announcements.repository.js';
import { AnnouncementsService } from './announcements.service.js';

const welcome: AnnouncementEntity = {
  id: 1,
  title: 'Welcome to Zazzles Exchange',
  body: 'This is a sample exchange.',
  authorId: 'u-admin',
  createdAt: labStart,
};

/** A repository that holds the given rows and does nothing else: the service is tested without a store. */
const repositoryHolding = (
  rows: AnnouncementEntity[],
): AnnouncementsRepository =>
  ({
    findAll: () => Promise.resolve(rows),
    findById: (id: number) =>
      Promise.resolve(rows.find((row) => row.id === id) ?? null),
  }) as unknown as AnnouncementsRepository;

describe('AnnouncementsService', () => {
  it('answers the announcement that is stored, with the stored identifier as the graph id', async () => {
    expect(
      await new AnnouncementsService(repositoryHolding([welcome])).byId(1),
    ).toEqual({
      id: '1',
      title: 'Welcome to Zazzles Exchange',
      body: 'This is a sample exchange.',
      authorId: 'u-admin',
      createdAt: labStart,
    });
  });

  it('answers nothing for an announcement that is not stored', async () => {
    expect(
      await new AnnouncementsService(repositoryHolding([welcome])).byId(99),
    ).toBeNull();
  });
});
