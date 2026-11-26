import { labStart } from '@zazzles/exchange-lab-data';
import type { UserDocument } from './user.document.js';
import { Role } from './user.model.js';
import type { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

const alice: UserDocument = {
  _id: 'u-alice',
  email: 'alice@zazzles.exchange',
  displayName: 'Alice',
  role: Role.USER,
  createdAt: labStart,
};

/** A repository that holds the given documents and does nothing else: the service is tested without a store. */
const repositoryHolding = (documents: UserDocument[]): UsersRepository =>
  ({
    findById: (id: string) =>
      Promise.resolve(
        documents.find((document) => document._id === id) ?? null,
      ),
  }) as unknown as UsersRepository;

describe('UsersService', () => {
  it('answers the user that is stored, with the stored identifier as the graph id', async () => {
    const user = await new UsersService(repositoryHolding([alice])).byId(
      'u-alice',
    );

    expect(user).toEqual({
      id: 'u-alice',
      email: 'alice@zazzles.exchange',
      displayName: 'Alice',
      role: Role.USER,
      createdAt: labStart,
    });
  });

  it('answers nothing for a user that is not stored', async () => {
    expect(
      await new UsersService(repositoryHolding([alice])).byId('u-nobody'),
    ).toBeNull();
  });
});
