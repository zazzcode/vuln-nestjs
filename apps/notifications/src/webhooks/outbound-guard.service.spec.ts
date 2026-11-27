import { OutboundGuardService } from './outbound-guard.service.js';

const ALLOWLIST = ['http://127.0.0.1:4010'];

/** A lookup a test can watch: it resolves nothing and remembers what it was asked. */
const lookupNotResolving = () => {
  const asked: string[] = [];
  return {
    asked,
    lookup: async (host: string) => {
      asked.push(host);
      return ['127.0.0.1'];
    },
  };
};

describe('OutboundGuardService', () => {
  test('refuses an origin that is not on the allowlist, before any name is resolved', async () => {
    const { asked, lookup } = lookupNotResolving();
    const guard = new OutboundGuardService(ALLOWLIST, lookup);

    expect(
      await guard.check('http://127.0.0.1:3000/api/v1/health'),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('not on the webhook allowlist'),
    });
    expect(asked).toEqual([]);
  });

  test.each([
    ['a relative value', '/webhook/alice'],
    ['a value with no scheme', '127.0.0.1:4010/webhook/alice'],
    ['another scheme', 'ftp://127.0.0.1:4010/webhook/alice'],
  ])('refuses %s', (_kind, url) => {
    const guard = new OutboundGuardService(ALLOWLIST);

    const decision = guard.decisionFor(url);
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(
      /^refused: (not an absolute http or https URL|the scheme ftp is not http or https)/,
    );
  });

  test.each([
    [
      'a port that is not on the allowlist',
      'http://127.0.0.1:4011/webhook/alice',
    ],
    [
      'a host that is not the allowlisted one',
      'http://127.0.0.2:4010/webhook/alice',
    ],
    [
      'a name where the allowlist has an address',
      'http://localhost:4010/webhook/alice',
    ],
  ])('refuses %s, naming the allowlist', (_kind, url) => {
    const guard = new OutboundGuardService(ALLOWLIST);

    expect(guard.decisionFor(url)).toEqual({
      allowed: false,
      reason: expect.stringContaining('not on the webhook allowlist'),
    });
  });

  test.each([
    ['an allowed URL', 'http://127.0.0.1:4010/webhook/alice'],
    [
      'an allowed URL with a path and a query',
      'http://127.0.0.1:4010/webhook/alice?attempt=2',
    ],
    [
      'an allowed https origin when the allowlist has one',
      'https://127.0.0.1:4010/webhook/alice',
    ],
  ])('allows %s by its rules', (_kind, url) => {
    const guard = new OutboundGuardService([
      'http://127.0.0.1:4010',
      'https://127.0.0.1:4010',
    ]);

    expect(guard.decisionFor(url)).toEqual({ allowed: true });
  });

  test('resolves the host of an allowed origin, and allows it when it is loopback', async () => {
    const { lookup } = lookupNotResolving();
    const guard = new OutboundGuardService(ALLOWLIST, lookup);

    expect(await guard.check('http://127.0.0.1:4010/webhook/alice')).toEqual({
      allowed: true,
    });
  });

  test('refuses an allowed origin whose host resolves off the loopback', async () => {
    const guard = new OutboundGuardService(ALLOWLIST, async () => ['10.0.0.5']);

    expect(await guard.check('http://127.0.0.1:4010/webhook/alice')).toEqual({
      allowed: false,
      reason: expect.stringContaining('does not resolve to a loopback address'),
    });
  });

  test('refuses an allowed origin whose host does not resolve at all', async () => {
    const guard = new OutboundGuardService(ALLOWLIST, async () => {
      throw new Error('ENOTFOUND');
    });

    expect(await guard.check('http://127.0.0.1:4010/webhook/alice')).toEqual({
      allowed: false,
      reason: expect.stringContaining('does not resolve'),
    });
  });

  test('trims and splits the allowlist it is given', () => {
    const guard = new OutboundGuardService([' http://127.0.0.1:4010 ', '']);

    expect(guard.decisionFor('http://127.0.0.1:4010/webhook/alice')).toEqual({
      allowed: true,
    });
  });
});
