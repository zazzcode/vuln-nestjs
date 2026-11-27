import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { bearer, call, gql, startLab, type Lab } from './lab.js';

/**
 * The allowlisted avatar fetch, in both directions. The service is started
 * with its allowlist on a stub of this file's, on loopback: with the default,
 * the lab's fake avatar host, the direction that fetches could not be reached
 * without a request that leaves the machine.
 */
let lab: Lab;
let stub: Server;
let origin: string;
let otherName: string;
const hits: string[] = [];

beforeAll(async () => {
  stub = createServer((request, response) => {
    hits.push(request.url ?? '');
    if (request.url === '/moved') {
      response.writeHead(302, { location: '/avatar.png' });
      response.end();
      return;
    }
    if (request.url === '/missing') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end('an avatar');
  });
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const port = (stub.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  // The same stub, named another way: an origin is compared as written.
  otherName = `http://localhost:${port}`;
  process.env.AVATAR_ALLOWED_ORIGINS = origin;
  lab = await startLab();
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
  delete process.env.AVATAR_ALLOWED_ORIGINS;
  await new Promise((resolve) => stub.close(resolve));
});

describe('the allowlisted avatar fetch, with the allowlist on loopback', () => {
  const fetchAvatar = (url: string) =>
    call(lab, '/internal/profile/avatar/fetch', {
      method: 'POST',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

  const avatarUrlOfAlice = async (): Promise<unknown> =>
    (await gql(lab, '{ me { avatarUrl } }', { token: lab.aliceToken })).data;

  test('an origin on the allowlist is fetched, and the URL is stored', async () => {
    const url = `${origin}/avatar.png`;
    const response = await fetchAvatar(url);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stored: true,
      user: { id: 'u-alice', avatarUrl: url },
    });
    expect(hits).toEqual(['/avatar.png']);
  });

  test('a redirect is refused: it is not followed, and nothing is stored', async () => {
    const before = hits.length;
    const storedBefore = await avatarUrlOfAlice();
    const response = await fetchAvatar(`${origin}/moved`);

    expect(await response.json()).toEqual({
      stored: false,
      reason: 'The avatar host answered with a redirect, which is not followed',
    });
    // The stub saw the one request that was allowed and nothing else: where
    // the redirect led was not asked
    expect(hits.slice(before)).toEqual(['/moved']);
    expect(await avatarUrlOfAlice()).toEqual(storedBefore);
  });

  test('a host on the allowlist that does not serve the avatar stores nothing', async () => {
    const storedBefore = await avatarUrlOfAlice();
    const response = await fetchAvatar(`${origin}/missing`);

    expect(await response.json()).toEqual({
      stored: false,
      reason: 'The avatar host did not serve the avatar',
    });
    expect(await avatarUrlOfAlice()).toEqual(storedBefore);
  });

  test('an origin not on the allowlist is refused before any request', async () => {
    const before = hits.length;
    const storedBefore = await avatarUrlOfAlice();
    const response = await fetchAvatar(`${otherName}/avatar.png`);

    // refused: the same stub under another name is another origin, and the
    // stub's count of hits did not move
    expect(await response.json()).toEqual({
      stored: false,
      reason: 'The avatar URL is not on the allowlist',
    });
    expect(hits.length).toBe(before);
    expect(await avatarUrlOfAlice()).toEqual(storedBefore);
  });
});
