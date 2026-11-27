import { Logger } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import {
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../../src/app.module.js';

// INJECT-002: one payload, a label whose second line reads as an
// administrator action, sent to the vulnerable operation and to each
// protected counterpart. What the logger is given is captured where the
// service runs; the spy is restored by each test.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);

/** The messages the logger is given while the callback runs. */
async function loggedWhile(send: () => Promise<void>): Promise<string[]> {
  const logged: string[] = [];
  const spy = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
  try {
    await send();
  } finally {
    spy.mockRestore();
  }
  return logged;
}

describe('INJECT-002: a label that forges a log line', () => {
  // One attacker value: a label with a newline in it, whose second line
  // reads as an administrator action that never happened.
  const label =
    'BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok';
  const forgedLine = '[admin] creditWallet u-bob amount=1000.00 status=ok';

  test('the exploit: createLabeledAlert writes the label into its log line as it is', async () => {
    await reset();

    let created: Awaited<ReturnType<typeof query>> | undefined;
    const logged = await loggedWhile(async () => {
      created = await query(
        'mutation($label: String!, $symbol: String!, $direction: AlertDirection!, $threshold: Decimal!) { createLabeledAlert(label: $label, symbol: $symbol, direction: $direction, threshold: $threshold) { id userId symbol direction threshold label enabled } }',
        {
          token: alice(),
          variables: {
            label,
            symbol: 'BTC-USD',
            direction: 'ABOVE',
            threshold: '70000.00',
          },
        },
      );
    });
    expect(created?.errors).toBeUndefined();
    expect(created?.data?.createLabeledAlert).toMatchObject({
      userId: 'u-alice',
      label,
    });

    // What was gained: exactly one message the logger received carries a
    // raw newline, and its second physical line is the forged action.
    const withRawNewline = logged.filter((message) => message.includes('\n'));
    expect(withRawNewline).toHaveLength(1);
    expect(withRawNewline[0]).toContain('label accepted: BTC above 70k');
    expect(withRawNewline[0]!.split('\n')[1]).toBe(forgedLine);
  });

  test('counterpart 1: createAlert logs one line, the label JSON-encoded, its newline two characters', async () => {
    await reset();

    const logged = await loggedWhile(async () => {
      const created = await query(
        'mutation($input: CreateAlertInput!) { createAlert(input: $input) { id userId label } }',
        {
          token: alice(),
          variables: {
            input: {
              symbol: 'BTC-USD',
              direction: 'ABOVE',
              threshold: '70000.00',
              label,
            },
          },
        },
      );
      expect(created.errors).toBeUndefined();
      expect(created.data?.createAlert).toMatchObject({ label });
    });

    // Why it was refused: no message the logger received carries a raw
    // newline, so no line of the payload can read as a line of the log.
    expect(logged.filter((message) => message.includes('\n'))).toHaveLength(0);

    // The same value, encoded: the label travels as two characters where
    // the payload had a line break.
    const encoded = logged.find((message) =>
      message.startsWith('alert created:'),
    );
    expect(encoded).toBeDefined();
    expect(encoded).toContain('\\n[admin] creditWallet');
    expect(JSON.parse(encoded!.replace(/^alert created: /, '')).label).toBe(
      label,
    );
  });

  test('counterpart 2: the interceptor records one structured record, the label a field of it', async () => {
    await reset();

    const logged = await loggedWhile(async () => {
      const created = await query(
        'mutation($input: CreateAlertInput!) { createAlert(input: $input) { id } }',
        {
          token: alice(),
          variables: {
            input: {
              symbol: 'BTC-USD',
              direction: 'ABOVE',
              threshold: '70000.00',
              label,
            },
          },
        },
      );
      expect(created.errors).toBeUndefined();
    });

    // Why it was refused: the label is one field of one structured record,
    // on one line, with whatever it contains inside the value.
    const records = logged.filter((message) =>
      message.startsWith('{"record":"alert-label"'),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).not.toContain('\n');
    expect(JSON.parse(records[0]!).label).toBe(label);
  });
});
