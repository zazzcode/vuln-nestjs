import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttp2Server } from 'node:http2';
import type { AddressInfo, Socket } from 'node:net';
import { connect as connectSocket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { answersOn, openDoor, type Door } from './door.mjs';

/** What the service behind the door was asked, and over what. */
interface Seen {
  method: string | undefined;
  path: string | undefined;
  scheme: string | undefined;
  authority: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  version: string | undefined;
}

const LARGE_ANSWER = JSON.stringify({ title: 'x'.repeat(300_000) });

/**
 * Stands in for a Fastify service on HTTP/2 cleartext. It records what each
 * request arrives as, answers `/large` with a long body, and echoes the rest.
 * It closes the way a service of the lab closes: by closing its listener and
 * waiting for its connections to end, never by ending them itself.
 */
async function standInService(): Promise<{
  server: ReturnType<typeof createHttp2Server>;
  port: number;
  seen: Seen[];
  openConnections: () => number;
  stop: () => Promise<void>;
}> {
  const server = createHttp2Server();
  const seen: Seen[] = [];
  const connections = new Set<Socket>();
  server.on('session', (session) => {
    // Kept by reference: once the session closes, Node has taken its socket away and reading it again throws.
    const socket = session.socket;
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
  });
  server.on('request', (request, response) => {
    const headers = request.headers;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      seen.push({
        method: headers[':method'],
        path: headers[':path'],
        scheme: headers[':scheme'],
        authority: headers[':authority'],
        headers,
        body,
        version: request.httpVersion,
      });
      const path = headers[':path'];
      if (path === '/slow') {
        // An answer that stays open until the caller's request is closed.
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"first":');
        return;
      }
      if (path === '/stream') {
        // An answer that comes in pieces, with no length to tell in advance: a file or a feed.
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.write('first ');
        setTimeout(() => response.end('last'), 50);
        return;
      }
      const answer =
        path === '/large'
          ? LARGE_ANSWER
          : JSON.stringify({
              method: headers[':method'],
              path,
              contentType: headers['content-type'],
              authorization: headers['authorization'],
              kept: headers['x-kept'],
              body,
            });
      // With its length stated, as Fastify states it.
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(answer),
        'set-cookie': ['a=1', 'b=2'],
        'x-through': 'yes',
      });
      response.end(answer);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    port,
    seen,
    openConnections: () => connections.size,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/** Opens a door on a port of its own before the file's tests, and closes it after them. */
function useDoor(target: () => string): () => Door {
  let door: Door | undefined;
  beforeAll(async () => {
    door = await openDoor({ service: 'lab', port: 0, target: target() });
  });
  afterAll(async () => {
    await door?.close();
  });
  return () => door as Door;
}

const post = (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

/**
 * Sends an HTTP/1.1 request exactly as written, the way no library would shape
 * one, and resolves with the whole answer. The caller asks for the connection
 * to close afterwards, which is what tells it the answer is over.
 */
function sendRaw(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connectSocket({ port, host: '127.0.0.1' });
    let text = '';
    socket.setTimeout(5_000, () => {
      socket.destroy();
      reject(new Error('The door did not answer in whole.'));
    });
    socket.on('connect', () => socket.write(request));
    socket.on('data', (data) => {
      text += data.toString();
    });
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
}

const portOf = (door: Door): number => Number(new URL(door.url).port);

/** Resolves when the count reaches zero, and fails the test, naming what stayed open, when it does not within two seconds. */
async function expectNothingOpen(
  what: string,
  count: () => number,
): Promise<void> {
  for (const _ of Array.from({ length: 40 })) {
    if (count() === 0) {
      return;
    }
    await delay(50);
  }
  expect(count(), `${what} still open`).toBe(0);
}

describe('a door in front of a service on HTTP/2', () => {
  let service: Awaited<ReturnType<typeof standInService>>;
  // The service is up before the door that leads to it is opened.
  beforeAll(async () => {
    service = await standInService();
  });

  afterAll(async () => {
    await service.stop();
  });

  const door = useDoor(() => `http://127.0.0.1:${service.port}`);

  test('carries a request and its JSON body as the caller sent them, over HTTP/2, and the answer back', async () => {
    const body = {
      query: '{ announcements { id } }',
      variables: { first: 3 },
    };
    const response = await post(`${door().url}/graphql?one=1`, body, {
      authorization: 'Bearer a-token-of-the-lab',
      'x-internal-token': 'a-token-of-the-run',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-through')).toBe('yes');
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(await response.json()).toEqual({
      method: 'POST',
      path: '/graphql?one=1',
      contentType: 'application/json',
      authorization: 'Bearer a-token-of-the-lab',
      body: JSON.stringify(body),
    });

    // The service is asked over HTTP/2, for its own address, as the gateway asks it.
    expect(service.seen.at(-1)).toMatchObject({
      method: 'POST',
      path: '/graphql?one=1',
      scheme: 'http',
      authority: `127.0.0.1:${service.port}`,
      version: '2.0',
      headers: { 'x-internal-token': 'a-token-of-the-run' },
    });
    // The door's own address, and the caller's connection, are not the service's to see.
    const headers = service.seen.at(-1)?.headers ?? {};
    expect(headers.host).toBeUndefined();
    expect(headers.connection).toBeUndefined();
    expect(headers['keep-alive']).toBeUndefined();
  });

  test('carries a request with no body', async () => {
    const response = await fetch(`${door().url}/anything`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ method: 'GET', body: '' });
  });

  // What `connection` names belongs to the connection as much as `connection` itself does. A header
  // whose name merely starts the same way is the service's to read.
  test('leaves behind what the caller says belongs to its connection', async () => {
    const answer = await sendRaw(
      portOf(door()),
      'GET /anything HTTP/1.1\r\nhost: lab\r\nconnection: close, x-mine\r\nx-mine: 1\r\nx-kept: yes\r\nconnection-adjacent: no\r\n\r\n',
    );

    expect(answer).toContain('"kept":"yes"');
    const headers = service.seen.at(-1)?.headers ?? {};
    expect(headers['x-mine']).toBeUndefined();
    expect(headers.connection).toBeUndefined();
    expect(headers['x-kept']).toBe('yes');
    expect(headers['connection-adjacent']).toBe('no');
  });

  test('carries an answer that comes in pieces, with no length stated', async () => {
    const response = await fetch(`${door().url}/stream`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(await response.text()).toBe('first last');
  });

  test('carries a body larger than one packet, whole, in both directions', async () => {
    const sent = {
      query: '{ announcements { id } }',
      title: 'y'.repeat(400_000),
    };
    const echoed = await post(`${door().url}/graphql`, sent).then((response) =>
      response.json(),
    );

    expect(echoed.body).toBe(JSON.stringify(sent));

    const large = await fetch(`${door().url}/large`).then((response) =>
      response.text(),
    );

    expect(large).toBe(LARGE_ANSWER);
  });

  test('carries a body the caller sends in chunks, without a length', async () => {
    const chunks = ['{"query": "', '{ orders { id } }', '"}'];
    const answer = await sendRaw(
      portOf(door()),
      'POST /graphql HTTP/1.1\r\nhost: lab\r\ncontent-type: application/json\r\nconnection: close\r\ntransfer-encoding: chunked\r\n\r\n' +
        chunks
          .map((chunk) => `${chunk.length.toString(16)}\r\n${chunk}\r\n`)
          .join('') +
        '0\r\n\r\n',
    );
    const [, body] = answer.split('\r\n\r\n');

    expect(JSON.parse(body ?? '{}')).toMatchObject({
      body: '{"query": "{ orders { id } }"}',
    });
  });

  // The regression this guards: a connection closed over an unread answer stays open on both sides,
  // and the service then waits on it when it is stopped.
  test('ends its connection to the service once an answer is read, so the service is not held open', async () => {
    await fetch(`${door().url}/large`).then((response) => response.text());

    await expectNothingOpen('door sessions', door().openSessions);
    await expectNothingOpen(
      'connections at the service',
      service.openConnections,
    );

    await expect(
      Promise.race([
        service.stop(),
        delay(2_000).then(() => {
          throw new Error(
            'The service was held open by a connection of the door.',
          );
        }),
      ]),
    ).resolves.toBeUndefined();
  });
});

describe('a door when the service does not answer', () => {
  // Nothing listens on port 1.
  const door = useDoor(() => 'http://127.0.0.1:1');

  test('answers 502 in the shape the lab uses, and takes the next request', async () => {
    const first = await post(`${door().url}/graphql`, {
      query: '{ orders { id } }',
    });

    expect(first.status).toBe(502);
    expect(await first.json()).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'lab did not answer',
    });

    expect((await post(`${door().url}/graphql`, {})).status).toBe(502);
    expect(door().openSessions()).toBe(0);
  });
});

describe('a door and its caller', () => {
  let service: Awaited<ReturnType<typeof standInService>>;
  // The service is up before the door that leads to it is opened.
  beforeAll(async () => {
    service = await standInService();
  });

  afterAll(async () => {
    await service.stop();
  });

  const door = useDoor(() => `http://127.0.0.1:${service.port}`);

  // The service's answer never ends on its own. Without the door closing the request, the connection
  // to the service would stay open for good.
  test('closes the request to the service when the caller goes away before the answer is over', async () => {
    const controller = new AbortController();
    // Resolves once the answer has begun.
    const response = await fetch(`${door().url}/slow`, {
      signal: controller.signal,
    });
    const reading = response.text();
    controller.abort();

    await expect(reading).rejects.toThrow();
    await expectNothingOpen('door sessions', door().openSessions);
    await expectNothingOpen(
      'connections at the service',
      service.openConnections,
    );
  });

  // A listener on any other address would be reachable from outside this machine.
  test('listens on the IPv4 loopback address only', async () => {
    expect(await answersOn(portOf(door()))).toBe(true);
    expect(await answersOn(portOf(door()), '::1')).toBe(false);
  });

  test('closes without waiting for a caller that holds a connection open, and releases its port', async () => {
    // A keep-alive connection, which the caller means to use for another request.
    const idle = await fetch(`${door().url}/anything`);
    await idle.text();

    await expect(
      Promise.race([
        door().close(),
        delay(2_000).then(() => {
          throw new Error('The door waited for its caller.');
        }),
      ]),
    ).resolves.toBeUndefined();

    expect(await answersOn(portOf(door()))).toBe(false);
    expect(door().openSessions()).toBe(0);
    // A stop that is asked for twice changes nothing.
    await door().close();
  });
});

describe('a door that cannot listen', () => {
  test('says which service and which port, instead of starting', async () => {
    const taken = createHttpServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    const { port } = taken.address() as AddressInfo;

    try {
      await expect(
        openDoor({ service: 'accounts', port, target: 'http://127.0.0.1:1' }),
      ).rejects.toThrow(
        `The door to accounts could not listen on 127.0.0.1:${port}`,
      );
    } finally {
      await new Promise<void>((resolve) => taken.close(() => resolve()));
    }
  });
});
