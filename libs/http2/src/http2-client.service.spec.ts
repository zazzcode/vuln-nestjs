import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { createServer as createHttpServer, type Server } from 'node:http';
import {
  createServer as createHttp2Server,
  type Http2Server,
} from 'node:http2';
import type { AddressInfo } from 'node:net';
import { Http2ClientService, callService, fetcherFor } from './index.js';

interface Echo {
  path: string | undefined;
  method: string | undefined;
  protocol: string;
  contentType: string | null;
  body: string;
}

/** Answers every request with what it received, so a test sees exactly what crossed the wire. */
async function echo(
  transport: 'http1' | 'http2',
): Promise<{ server: Server | Http2Server; url: string }> {
  const server =
    transport === 'http2' ? createHttp2Server() : createHttpServer();
  server.on('request', (request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const received: Echo = {
        path: request.url,
        method: request.method,
        protocol: request.httpVersion,
        contentType: request.headers['content-type'] ?? null,
        body: Buffer.concat(chunks).toString(),
      };
      const answer = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (request.url?.startsWith('/missing')) {
        answer(404, {
          statusCode: 404,
          message: 'Nothing is at this path',
          error: 'Not Found',
        });
      } else if (request.url?.startsWith('/slow')) {
        setTimeout(() => answer(200, received), 500);
      } else {
        answer(200, received);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

const closed = (server: Server | Http2Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

describe('Http2ClientService', () => {
  let server: Http2Server;
  let url: string;
  let client: Http2ClientService;

  beforeEach(async () => {
    const started = await echo('http2');
    server = started.server as Http2Server;
    url = started.url;
    client = new Http2ClientService();
  });

  afterEach(async () => {
    await client.onApplicationShutdown();
    await closed(server);
  });

  it('returns the status, the headers and the body of a GET, over HTTP/2 cleartext', async () => {
    const response = await client.fetch(`${url}/health`);
    const received = (await response.json()) as Echo;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(received).toMatchObject({
      path: '/health',
      method: 'GET',
      protocol: '2.0',
    });
  });

  it('sends a JSON body with its content type, as the service receives it', async () => {
    const received = await client.request<Echo>(
      'POST',
      `${url}/internal/lab/reset`,
      { body: { reason: 'again' } },
    );

    expect(received).toMatchObject({
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ reason: 'again' }),
    });
  });

  it('rejects with the status and the message the service answered', async () => {
    const failure: unknown = await client
      .request('GET', `${url}/missing`)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(404);
    expect((failure as HttpException).getResponse()).toMatchObject({
      statusCode: 404,
      message: 'Nothing is at this path',
    });
  });

  it('rejects a call that is aborted before it is answered', async () => {
    const controller = new AbortController();
    const pending = client.fetch(`${url}/slow`, { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toThrow();
  });

  it('closes the sessions it opened when the application stops', async () => {
    const sessionClosed = new Promise<void>((resolve) =>
      server.on('session', (session) => session.on('close', () => resolve())),
    );

    await client.fetch(`${url}/health`);
    await client.onApplicationShutdown();

    await sessionClosed;
  });
});

describe('callService', () => {
  it('reports a service that does not answer in time as unavailable', async () => {
    const neverAnswers = (signal: AbortSignal) =>
      new Promise<never>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))),
      );

    const failure: unknown = await callService(
      'accounts',
      neverAnswers,
      20,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).message).toMatch(
      /accounts did not answer within 20 ms/,
    );
  });

  it('reports a service that is down as unavailable', async () => {
    // A port nobody listens on: the closest a test gets to a service that is not running.
    const stopped = await echo('http2');
    const down = stopped.url;
    await closed(stopped.server as Http2Server);

    const failure: unknown = await callService('trading', () =>
      fetch(`${down}/internal/health`),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).message).toMatch(/trading is unreachable/);
  });

  it('passes on what a service answered, without wrapping it', async () => {
    const refusal = new HttpException('Forbidden resource', 403);

    await expect(
      callService('accounts', async () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);
  });
});

describe('fetcherFor', () => {
  it('speaks HTTP/2 cleartext to a service whose listener does, and HTTP/1.1 to the rest', async () => {
    const fastify = await echo('http2');
    const express = await echo('http1');
    const client = new Http2ClientService();
    try {
      const toAccounts = (
        (await (
          await fetcherFor(client, 'accounts')(`${fastify.url}/graphql`, {
            method: 'POST',
          })
        ).json()) as Echo
      ).protocol;
      const toNotifications = (
        (await (
          await fetcherFor(client, 'notifications')(`${express.url}/graphql`, {
            method: 'POST',
          })
        ).json()) as Echo
      ).protocol;

      expect(toAccounts).toBe('2.0');
      expect(toNotifications).toBe('1.1');
    } finally {
      await client.onApplicationShutdown();
      await closed(fastify.server);
      await closed(express.server);
    }
  });
});
