import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { Http2Module } from '@zazzles/exchange-http2';
import { runSecret } from '@zazzles/exchange-testing';
import { type DynamicModule, type Type } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createServer as createHttpServer, type Server } from 'node:http';
import {
  createServer as createHttp2Server,
  type Http2Server,
} from 'node:http2';
import type { AddressInfo } from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { Environment } from '../src/config/environment.js';
import { InternalClientService } from '../src/internal/internal-client.service.js';
import { InternalModule } from '../src/internal/internal.module.js';
import { LabModule } from '../src/lab/lab.module.js';

/** Secrets for a run, so the real guards are registered as they are in the service. */
function secrets(): void {
  process.env.JWT_SECRET = runSecret();
  process.env.INTERNAL_SERVICE_TOKEN = runSecret();
}

/** Starts an application in memory, on the adapter the gateway uses. No port is opened. */
async function start(
  imports: Array<Type<unknown> | DynamicModule>,
  client?: object,
): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({ imports });
  const moduleRef = await (
    client === undefined
      ? builder
      : builder.overrideProvider(InternalClientService).useValue(client)
  ).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await app.init();
  return app;
}

const healthy = (service: string) => ({
  status: 'ok',
  service,
  store: { engine: 'an engine', connected: true },
});

describe('the lab endpoints of the gateway, with no backend service running', () => {
  // The one place in the gateway that reaches another service is replaced. The guards are the real ones.
  const client = { health: vi.fn(), reset: vi.fn() };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    secrets();
    app = await start(
      [EnvironmentModule.forRoot(Environment), AuthModule, LabModule],
      client,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // The guards are registered, and neither endpoint asks for a token: both are open by design.
  test('health answers a request with no token, with every backend service and its store', async () => {
    client.health.mockImplementation(async (service: string) =>
      healthy(service),
    );

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      services: {
        accounts: healthy('accounts'),
        trading: healthy('trading'),
        notifications: healthy('notifications'),
      },
    });
  });

  test('health reports a service that does not answer by name, with 503, and the others as they are', async () => {
    client.health.mockImplementation(async (service: string) => {
      if (service === 'trading') {
        throw new Error(
          'trading is unreachable (connect ECONNREFUSED 127.0.0.1:3102)',
        );
      }
      return healthy(service);
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      services: {
        accounts: healthy('accounts'),
        trading: { status: 'unavailable', service: 'trading' },
        notifications: healthy('notifications'),
      },
    });
  });

  // A service that is up with a store that is not connected is not up, and its own report says so.
  test('health does not call the lab up while a store is not connected, and shows what that service answered', async () => {
    client.health.mockImplementation(async (service: string) =>
      service === 'accounts'
        ? {
            status: 'ok',
            service,
            store: { engine: 'mongodb', connected: false },
          }
        : healthy(service),
    );

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'unavailable',
      services: {
        accounts: {
          status: 'ok',
          store: { engine: 'mongodb', connected: false },
        },
      },
    });
  });

  test('reset answers with one status per service, and a service that failed by name', async () => {
    const reset = () =>
      app.inject({ method: 'POST', url: '/api/v1/lab/reset' });

    client.reset.mockResolvedValue({ status: 'ok' });
    const succeeded = await reset();

    expect(succeeded.statusCode).toBe(200);
    expect(succeeded.json()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'ok',
    });

    client.reset.mockImplementation(async (service: string) => {
      if (service === 'notifications') {
        throw new Error('refused');
      }
      return { status: 'ok' };
    });
    expect((await reset()).json()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'unavailable',
    });
  });
});

interface Reached {
  method: string | undefined;
  path: string | undefined;
  protocol: string;
  token: string | undefined;
}

/** Stands in for a backend service: answers health, and records what reached it. */
async function standIn(
  transport: 'http1' | 'http2',
  service: string,
): Promise<{
  server: Server | Http2Server;
  port: number;
  received: Reached[];
}> {
  const server: Server | Http2Server =
    transport === 'http2' ? createHttp2Server() : createHttpServer();
  const received: Reached[] = [];
  server.on('request', (request, response) => {
    request.resume();
    request.on('end', () => {
      received.push({
        method: request.method,
        path: request.url,
        protocol: request.httpVersion,
        token: request.headers['x-internal-token'] as string | undefined,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, port, received };
}

describe('the client of the gateway for the backend services', () => {
  let app: NestFastifyApplication;
  let accounts: Awaited<ReturnType<typeof standIn>>;
  let notifications: Awaited<ReturnType<typeof standIn>>;

  beforeAll(async () => {
    secrets();
    accounts = await standIn('http2', 'accounts');
    notifications = await standIn('http1', 'notifications');
    process.env.ACCOUNTS_PORT = String(accounts.port);
    // Nobody listens on port 1: the closest a test gets to a service that is not running.
    process.env.TRADING_PORT = '1';
    process.env.NOTIFICATIONS_PORT = String(notifications.port);
    app = await start([
      EnvironmentModule.forRoot(Environment),
      Http2Module,
      InternalModule,
    ]);
  });

  afterAll(async () => {
    await app.close();
    for (const { server } of [accounts, notifications]) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('reaches a service over the transport it speaks, with the service token, and returns what it answered', async () => {
    const client = app.get(InternalClientService);

    expect(await client.health('accounts')).toEqual({
      status: 'ok',
      service: 'accounts',
    });
    expect(accounts.received.at(-1)).toEqual({
      method: 'GET',
      path: '/internal/health',
      protocol: '2.0',
      token: process.env.INTERNAL_SERVICE_TOKEN,
    });

    expect(await client.reset('notifications')).toEqual({
      status: 'ok',
      service: 'notifications',
    });
    expect(notifications.received.at(-1)).toEqual({
      method: 'POST',
      path: '/internal/lab/reset',
      protocol: '1.1',
      token: process.env.INTERNAL_SERVICE_TOKEN,
    });
  });

  test('reports a service that is not running as unavailable', async () => {
    const failure: unknown = await app
      .get(InternalClientService)
      .health('trading')
      .catch((error: unknown) => error);

    expect((failure as Error).message).toMatch(/trading is unreachable/);
  });
});
