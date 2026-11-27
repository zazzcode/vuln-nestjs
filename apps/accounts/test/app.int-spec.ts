import { FastifyAdapter } from '@nestjs/platform-fastify';
import { readFileSync } from 'node:fs';
import { administrator, labStart, labUsers } from '@zazzles/exchange-lab-data';
import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../src/app.module.js';
import type { MongoDatabase } from '../src/database/database.module.js';
import { MONGO_DATABASE } from '../src/database/mongo.store.js';
import {
  USERS_COLLECTION,
  type UserDocument,
} from '../src/users/user.document.js';
import { Role } from '../src/users/user.model.js';

// The service is started with the adapter it uses, on its own port, with a store it starts itself.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new FastifyAdapter({ http2: true }),
    port: 3101,
  });
}, 300_000);

// Stops the service, and fails when a mongod process or a temporary directory it created remains.
afterAll(async () => {
  await service?.stop();
});

type LabUser = (typeof labUsers)[number];

const tokenOf = (user: LabUser): string =>
  sessionToken(JWT_SECRET, {
    sub: user.id,
    sid: `s-${user.id}`,
    role: user.role,
  });
const authorization = (token: string) => ({ authorization: `Bearer ${token}` });
const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);

describe('the accounts service, started alone', () => {
  const alice = labUsers.find((user) => user.id === 'u-alice') as LabUser;

  test('says it is up, with its store connected', async () => {
    const response = await request(`${service.url}/internal/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'accounts',
      store: { engine: 'mongodb', connected: true },
    });
  });

  test('speaks HTTP/2 cleartext on its listener, and nothing else', async () => {
    await expect(fetch(`${service.url}/internal/health`)).rejects.toThrow();

    expect((await request(`${service.url}/internal/health`)).status).toBe(200);
    expect(service.receivedHttpVersions().at(-1)).toBe('2.0');
  });

  test('refuses a closed operation that carries no token, and a user where an administrator is required', async () => {
    const source = '{ user(id: "u-alice") { id } }';

    expect(errorCode(await query(source))).toBe('UNAUTHENTICATED');
    expect(errorCode(await query(source, { token: tokenOf(alice) }))).toBe(
      'FORBIDDEN',
    );
  });

  test('answers an administrator with the user asked for', async () => {
    const response = await query(
      '{ user(id: "u-alice") { id email displayName role createdAt } }',
      {
        token: tokenOf(administrator),
      },
    );

    expect(response).toEqual({
      data: {
        user: {
          id: 'u-alice',
          email: 'alice@vcx.exchange',
          displayName: 'Alice',
          role: Role.USER,
          createdAt: labStart.toISOString(),
        },
      },
    });
  });

  test('answers nothing for a user that does not exist', async () => {
    expect(
      (
        await query('{ user(id: "u-nobody") { id } }', {
          token: tokenOf(administrator),
        })
      ).data,
    ).toEqual({ user: null });
  });

  test('resolves a user by key for the gateway, which is how another service reaches one', async () => {
    const response = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id email } } }',
      {
        token: tokenOf(alice),
        variables: { representations: [{ __typename: 'User', id: 'u-bob' }] },
      },
    );

    expect(response.data).toEqual({
      _entities: [{ id: 'u-bob', email: 'bob@vcx.exchange' }],
    });
  });

  test('refuses its internal REST to a request with no token, and to a user where an administrator is required', async () => {
    expect((await request(`${service.url}/internal/users`)).status).toBe(401);
    expect(
      (
        await request(`${service.url}/internal/users`, {
          headers: authorization(tokenOf(alice)),
        })
      ).status,
    ).toBe(403);
  });

  test('lists the six users for an administrator, over internal REST', async () => {
    const response = await request(`${service.url}/internal/users`, {
      headers: authorization(tokenOf(administrator)),
    });

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { id: string }[])
        .map((user) => user.id)
        .sort(),
    ).toEqual(labUsers.map((user) => user.id).sort());
  });

  test('returns its store to the fake data on reset, which answers only to the service token', async () => {
    const users = service.app
      .get<MongoDatabase>(MONGO_DATABASE)
      .collection<UserDocument>(USERS_COLLECTION);
    await users.updateOne(
      { _id: 'u-alice' },
      { $set: { displayName: 'Changed' } },
    );
    const reset = () =>
      request(`${service.url}/internal/lab/reset`, { method: 'POST' });

    expect((await reset()).status).toBe(401);
    expect(
      (
        await request(`${service.url}/internal/lab/reset`, {
          method: 'POST',
          headers: { 'x-internal-token': SERVICE_TOKEN },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await query('{ user(id: "u-alice") { displayName } }', {
          token: tokenOf(administrator),
        })
      ).data,
    ).toEqual({
      user: { displayName: 'Alice' },
    });
  });

  // What the gateway composes from: an entity with a key, and the scalars every subgraph defines the same way.
  test('generates a federation schema with a key on the user and the shared scalars', () => {
    const schema = readFileSync(
      new URL('../schema.gql', import.meta.url),
      'utf8',
    );

    expect(schema).toContain('type User @key(fields: "id")');
    for (const scalar of ['Decimal', 'DateTime', 'JSON']) {
      expect(schema).toContain(`scalar ${scalar}`);
    }
  });
});
