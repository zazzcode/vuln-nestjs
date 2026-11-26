import { ExpressAdapter } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';
import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { labStart } from '@zazzles/exchange-lab-data';
import { AppModule } from '../src/app.module.js';

// The service is started with the adapter it uses, on its own port, with a store it holds itself.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
}, 300_000);

// Stops the service, and fails when anything it created remains.
afterAll(async () => {
  await service?.stop();
});

/** One request over HTTP/2 cleartext, with prior knowledge. */
function cleartextHttp2(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const session = connect(new URL(url).origin);
    session.on('error', reject);
    const stream = session.request({ ':path': new URL(url).pathname });
    stream.on('error', (error) => {
      session.close();
      reject(error);
    });
    stream.on('response', (head) => {
      session.close();
      resolve(Number(head[':status']));
    });
    stream.end();
  });
}

describe('the notifications service, started alone', () => {
  const query = (
    source: string,
    options: { token?: string; variables?: Record<string, unknown> } = {},
  ) => graphql(`${service.url}/graphql`, source, options);

  test('says it is up, with its store connected', async () => {
    const response = await request(`${service.url}/internal/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'notifications',
      store: { engine: 'sqlite', connected: true },
    });
  });

  test('speaks HTTP/1.1 on its listener, and nothing else', async () => {
    await expect(
      cleartextHttp2(`${service.url}/internal/health`),
    ).rejects.toThrow();

    expect((await request(`${service.url}/internal/health`)).status).toBe(200);
    expect(service.receivedHttpVersions().at(-1)).toBe('1.1');
  });

  test('answers anyone who asks for the announcements, with no token', async () => {
    expect(
      await query('{ announcements { id title body authorId createdAt } }'),
    ).toEqual({
      data: {
        announcements: [
          {
            id: '1',
            title: 'Welcome to Zazzles Exchange',
            body: 'This is a sample exchange. Every account and every coin on it is invented.',
            authorId: 'u-admin',
            createdAt: labStart.toISOString(),
          },
        ],
      },
    });
  });

  test('resolves an announcement by key for the gateway', async () => {
    const response = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on Announcement { id title } } }',
      {
        token: sessionToken(JWT_SECRET, {
          sub: 'u-alice',
          sid: 's',
          role: 'USER',
        }),
        variables: {
          representations: [{ __typename: 'Announcement', id: '1' }],
        },
      },
    );

    expect(response.data).toEqual({
      _entities: [{ id: '1', title: 'Welcome to Zazzles Exchange' }],
    });
  });

  test('returns its store to the fake data on reset, which answers only to the service token', async () => {
    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    await dataSource.query(
      "UPDATE announcements SET title = 'Changed' WHERE id = 1",
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
    expect((await query('{ announcements { id title } }')).data).toEqual({
      announcements: [{ id: '1', title: 'Welcome to Zazzles Exchange' }],
    });
  });

  // What the gateway composes from: an entity with a key, and the scalars every subgraph defines the same way.
  test('generates a federation schema with a key on the announcement and the shared scalars', () => {
    const schema = readFileSync(
      new URL('../schema.gql', import.meta.url),
      'utf8',
    );

    expect(schema).toContain('type Announcement @key(fields: "id")');
    for (const scalar of ['Decimal', 'DateTime', 'JSON']) {
      expect(schema).toContain(`scalar ${scalar}`);
    }
  });

  // An error of GraphQL itself keeps GraphQL's own code through the formatter.
  test("answers a query for a field that does not exist with GraphQL's own code", async () => {
    expect(errorCode(await query('{ noSuchField }'))).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });
});
