import { createServer as createHttpServer, type Server } from 'node:http';
import {
  createServer as createHttp2Server,
  type Http2Server,
} from 'node:http2';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  ENGINES,
  HEALTH_TIMEOUT_MS,
  SERVICES_WITH_A_DOOR,
  START_ORDER,
  STOP_GRACE_MS,
  doorPortOf,
  generateRunSecrets,
  isHealthy,
  leftovers,
  missingBuilds,
  portOf,
  temporaryDirectories,
  waitForHealth,
} from './start.mjs';

/** The piece of a service's description its health check needs. */
const service = (transport: 'http1' | 'http2', port: number) => ({
  name: `stand-in on ${port}`,
  port,
  portVariable: 'NEVER_SET_PORT_VARIABLE',
  transport,
  health: '/internal/health',
});

/** Stands in for a Fastify service: answers the health path over HTTP/2 cleartext, with 200 and a body. */
async function standIn(
  body: string,
): Promise<{ server: Http2Server; port: number; delivered: () => boolean }> {
  const server = createHttp2Server();
  let delivered = false;
  server.on('request', (request, response) => {
    if (request.url !== '/internal/health') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    // True only if the whole body left: false when the stream closes with some of it still unsent.
    response.on('close', () => {
      delivered = delivered || response.writableFinished;
    });
    response.end(body);
    request.resume();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, port, delivered: () => delivered };
}

/** Three times what one HTTP/2 stream may have outstanding before the client reads any of it. */
const LARGE_BODY = JSON.stringify({
  status: 'ok',
  padding: 'x'.repeat(200_000),
});

describe('the secrets of a run', () => {
  test('are two different secrets, each 64 hex characters, made again on every call', () => {
    const first = generateRunSecrets();
    const second = generateRunSecrets();

    for (const secrets of [first, second]) {
      expect(secrets.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
      expect(secrets.INTERNAL_SERVICE_TOKEN).toMatch(/^[0-9a-f]{64}$/);
      expect(secrets.JWT_SECRET).not.toBe(secrets.INTERNAL_SERVICE_TOKEN);
    }
    expect(second.JWT_SECRET).not.toBe(first.JWT_SECRET);
    expect(second.INTERNAL_SERVICE_TOKEN).not.toBe(
      first.INTERNAL_SERVICE_TOKEN,
    );
  });
});

describe('the order the services start in', () => {
  test('the gateway is last: it composes the graph at start, so the others are up first', () => {
    const names = START_ORDER.map((service) => service.name);

    expect(names.at(-1)).toBe('gateway');
    expect([...names].sort()).toEqual([
      'accounts',
      'gateway',
      'notifications',
      'trading',
    ]);
  });

  test('no two services share a default port, and each says how it is asked', () => {
    const ports = START_ORDER.map((service) => service.port);

    expect(new Set(ports).size).toBe(START_ORDER.length);
    for (const service of START_ORDER) {
      expect(['http1', 'http2']).toContain(service.transport);
      expect(service.portVariable).toMatch(/_PORT$/);
    }
    // Two engines the backend services start, and a long and a short allowance to wait and to stop.
    expect(ENGINES).toEqual(['mongod', 'mysqld']);
    expect(HEALTH_TIMEOUT_MS).toBeGreaterThan(STOP_GRACE_MS * 10);
  });
});

describe('where a service is reached', () => {
  test('on the port its own variable names, else on its default', () => {
    const definition = START_ORDER.find(
      (service) => service.name === 'accounts',
    );

    expect(portOf(definition, { ACCOUNTS_PORT: '4200' })).toBe(4200);
    expect(portOf(definition, {})).toBe(3101);
  });
});

describe('the doors in front of the services on HTTP/2', () => {
  test('one in front of each of them, and in front of no service on HTTP/1.1', () => {
    expect(SERVICES_WITH_A_DOOR.map((service) => service.name)).toEqual([
      'accounts',
      'trading',
    ]);
    for (const service of START_ORDER) {
      expect(service.doorPort !== undefined).toBe(
        service.transport === 'http2',
      );
    }
  });

  test('each on a port of its own, away from the services, named by a variable of its own', () => {
    const ports = [
      ...START_ORDER.map((service) => service.port),
      ...SERVICES_WITH_A_DOOR.map((service) => service.doorPort),
    ];

    expect(new Set(ports).size).toBe(
      START_ORDER.length + SERVICES_WITH_A_DOOR.length,
    );
    const accounts = SERVICES_WITH_A_DOOR[0];
    expect(accounts.doorPortVariable).toBe('ACCOUNTS_DOOR_PORT');
    expect(doorPortOf(accounts, { ACCOUNTS_DOOR_PORT: '4201' })).toBe(4201);
    expect(doorPortOf(accounts, {})).toBe(3201);
  });
});

describe('what needs building first', () => {
  let root: string;

  beforeAll(() => {
    // A repository with nothing built in it.
    root = mkdtempSync(path.join(tmpdir(), 'vuln-nestjs-start-spec-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('every service whose built entry point is missing, in start order', () => {
    expect(missingBuilds(root)).toEqual([
      'accounts',
      'trading',
      'notifications',
      'gateway',
    ]);

    // Built for two of them.
    for (const name of ['accounts', 'notifications']) {
      mkdirSync(path.join(root, 'apps', name, 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'apps', name, 'dist', 'main.js'), '');
    }

    expect(missingBuilds(root)).toEqual(['trading', 'gateway']);
  });
});

describe('asking a service whether it is up', () => {
  let cleartext: Awaited<ReturnType<typeof standIn>>;
  let plain: Server;
  let plainPort: number;

  beforeAll(async () => {
    // A Fastify service: HTTP/2 cleartext, and nothing else.
    cleartext = await standIn(LARGE_BODY);
    // The Express service and the gateway: HTTP/1.1.
    plain = createHttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(LARGE_BODY);
    });
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    plainPort = (plain.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const server of [cleartext.server, plain]) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // The regression this guards: the check once closed its session as soon as the headers arrived. The body was
  // never read, the connection stayed open on both sides, and the service then waited on it when it was stopped.
  test('reads the response to its end before it closes the connection', async () => {
    expect(await isHealthy(service('http2', cleartext.port))).toBe(true);
    await delay(50);

    expect(cleartext.delivered()).toBe(true);
  });

  test('says a service is up only when its health path answers 200, over the transport it speaks', async () => {
    expect(
      await isHealthy({
        ...service('http2', cleartext.port),
        health: '/not-found',
      }),
    ).toBe(false);
    // Nothing listens on port 1.
    expect(await isHealthy(service('http2', 1))).toBe(false);
    expect(await isHealthy(service('http1', 1))).toBe(false);
    expect(await isHealthy(service('http1', plainPort))).toBe(true);
    // Each stand-in refuses the other's protocol: the health check must have used the right one to succeed.
    expect(await isHealthy(service('http1', cleartext.port))).toBe(false);
    expect(await isHealthy(service('http2', plainPort))).toBe(false);
  });

  test('waits for a service that is not up yet, and gives up naming it', async () => {
    await expect(
      waitForHealth(service('http2', 1), { timeoutMs: 300 }),
    ).rejects.toThrow(/stand-in on 1 did not answer/);

    await expect(
      waitForHealth(service('http2', cleartext.port), { timeoutMs: 5_000 }),
    ).resolves.toBeUndefined();
  });
});

describe('what a run can leave behind', () => {
  test('is told from what was already there', () => {
    const before = {
      processes: [{ pid: 1, name: 'mongod' }],
      directories: ['/tmp/mongo-mem-earlier'],
    };

    expect(
      leftovers(before, {
        processes: [
          { pid: 1, name: 'mongod' },
          { pid: 2, name: 'mysqld' },
        ],
        directories: ['/tmp/mongo-mem-earlier', '/tmp/mongo-mem-newer'],
      }),
    ).toEqual({
      processes: [{ pid: 2, name: 'mysqld' }],
      directories: ['/tmp/mongo-mem-newer'],
    });
  });

  test('counts a mongod data directory, a mysqld one, and nothing else under the temporary folder', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'vuln-nestjs-temp-'));
    try {
      mkdirSync(path.join(base, 'mongo-mem-abc123'));
      mkdirSync(path.join(base, 'mysqlmsn', 'dbs', '7f0e'), {
        recursive: true,
      });
      // Cached binaries and anything unrelated are not what a run leaves behind.
      mkdirSync(path.join(base, 'mysqlmsn', 'binaries', '8.4.9'), {
        recursive: true,
      });
      mkdirSync(path.join(base, 'something-else'));

      expect(temporaryDirectories(base)).toEqual([
        path.join(base, 'mongo-mem-abc123'),
        path.join(base, 'mysqlmsn', 'dbs', '7f0e'),
      ]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
