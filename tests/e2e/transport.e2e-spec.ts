import { connect } from 'node:http2';
import { networkInterfaces } from 'node:os';
import type { ServiceName } from '@zazzles/exchange-config';
import { request } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';

const lab = useLab();

type Protocol = 'http1' | 'http2';

/** Asks a URL for the health path, over one protocol. Resolves with the status, or rejects. */
function ask(url: string, protocol: Protocol): Promise<number> {
  if (protocol === 'http1') {
    return fetch(url, { signal: AbortSignal.timeout(2_000) }).then(
      (response) => response.status,
    );
  }
  return new Promise((resolve, reject) => {
    const session = connect(new URL(url).origin);
    session.on('error', reject);
    const stream = session.request({ ':path': new URL(url).pathname });
    // The status arrives with the response headers.
    let status = 0;
    stream.on('error', (error) => {
      session.destroy();
      reject(error);
    });
    stream.on('response', (head) => {
      status = Number(head[':status']);
    });
    stream.on('data', () => {});
    stream.on('end', () => {
      session.close();
      resolve(status);
    });
    stream.end();
  });
}

/** True when nothing answered within two seconds, whatever the protocol. */
async function nobodyAnswers(
  url: string,
  protocol: Protocol,
): Promise<boolean> {
  try {
    await ask(url, protocol);
    return false;
  } catch {
    return true;
  }
}

const healthUrl = (
  service: ServiceName,
  host = '127.0.0.1',
  port: number,
): string =>
  `http://${host.includes(':') ? `[${host}]` : host}:${port}${service === 'gateway' ? '/api/v1/health' : '/internal/health'}`;

const PORTS: Record<ServiceName, number> = {
  gateway: 3000,
  accounts: 3101,
  trading: 3102,
  notifications: 3103,
};

describe('the transports between the processes', () => {
  // Each listener speaks exactly one protocol. So a call that succeeded proves which one the caller used.
  test('accounts and trading answer HTTP/2 cleartext, and nothing else', async () => {
    for (const service of ['accounts', 'trading'] as const) {
      const url = healthUrl(service, '127.0.0.1', PORTS[service]);

      expect(await nobodyAnswers(url, 'http1')).toBe(true);
      expect(await ask(url, 'http2')).toBe(200);
    }
  });

  test('notifications and the gateway answer HTTP/1.1, and nothing else', async () => {
    for (const service of ['notifications', 'gateway'] as const) {
      const url = healthUrl(service, '127.0.0.1', PORTS[service]);

      expect(await nobodyAnswers(url, 'http2')).toBe(true);
      expect(await ask(url, 'http1')).toBe(200);
    }
  });

  test("so the gateway, which learned each service's state, reached each one over the only protocol it speaks", async () => {
    const health = await fetch(`${lab().url}/api/v1/health`).then((response) =>
      response.json(),
    );

    // The gateway reports what each service answered. Each service answers on one protocol only (the two tests above),
    // and the gateway reports all three, so it reached accounts and trading over HTTP/2 and notifications over HTTP/1.1.
    expect(
      Object.fromEntries(
        Object.entries(health.services).map(([name, state]) => [
          name,
          (state as { status: string }).status,
        ]),
      ),
    ).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'ok',
    });
  });

  test('a query that needs all three services is answered over those transports', async () => {
    const response = await request(`${lab().url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ announcements { id title } }' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        announcements: [{ id: '1', title: 'Welcome to Zazzles Exchange' }],
      },
    });
  });

  // A listener on any other address would be reachable from outside this machine.
  test('no listener answers on the IPv6 loopback address, or on an address of the network', async () => {
    const onNetwork = Object.values(networkInterfaces())
      .flat()
      .find(
        (address) => address?.family === 'IPv4' && !address.internal,
      )?.address;
    const of = (service: ServiceName): Protocol =>
      service === 'accounts' || service === 'trading' ? 'http2' : 'http1';

    for (const [service, port] of Object.entries(PORTS) as [
      ServiceName,
      number,
    ][]) {
      const protocol = of(service);

      expect({
        service,
        refused: await nobodyAnswers(healthUrl(service, '::1', port), protocol),
      }).toEqual({ service, refused: true });
      // A machine with no network address of its own is left out of the second half.
      if (onNetwork) {
        expect({
          service,
          refused: await nobodyAnswers(
            healthUrl(service, onNetwork, port),
            protocol,
          ),
        }).toEqual({ service, refused: true });
      }
    }
  });
});
