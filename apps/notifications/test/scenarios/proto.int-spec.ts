import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { startNotificationsService } from '../support/service.js';
import { UserSettingsEntity } from '../../src/settings/user-settings.entity.js';

// PROTO-003: one payload, a path that walks off the row it was given, sent to
// the vulnerable operation and to each protected counterpart. What the
// pollution reaches is read in this process, where the service runs.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startNotificationsService();
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

afterEach(() => {
  // Hygiene for the tests that follow, not a fix: the operation still pollutes.
  delete (UserSettingsEntity.prototype as { webhook?: boolean }).webhook;
  delete (Object.prototype as { webhook?: boolean }).webhook;
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

/** Alice's channels, through the field the graph answers them by. */
const aliceSettings = async (): Promise<{
  email: boolean;
  sms: boolean;
  webhook: boolean;
}> => {
  const answer = await query(
    'query($r: [_Any!]!) { _entities(representations: $r) { ... on User { notificationSettings } } }',
    {
      token: alice(),
      variables: { r: [{ __typename: 'User', id: 'u-alice' }] },
    },
  );
  const settings = (
    answer.data as { _entities: { notificationSettings: unknown }[] } | null
  )?._entities[0]?.notificationSettings as {
    email: boolean;
    sms: boolean;
    webhook: boolean;
  };
  if (settings === undefined) {
    throw new Error(answer.errors?.[0]?.message ?? 'no settings');
  }
  return settings;
};

describe('PROTO-003: a path that reaches every object', () => {
  // One attacker value: a path whose first segment is the row's prototype.
  const path = '__proto__.webhook';

  test('the exploit: setChannelByPath writes past the row, onto its prototype', async () => {
    await reset();

    // The channel is off, so what the path writes cannot be the row's own field.
    const off = await query(
      'mutation { setChannel(name: WEBHOOK, enabled: false) { webhook } }',
      { token: alice() },
    );
    expect(off.data).toMatchObject({ setChannel: { webhook: false } });

    const polluted = await query(
      'mutation($path: String!, $enabled: Boolean!) { setChannelByPath(path: $path, enabled: $enabled) { webhook } }',
      { token: alice(), variables: { path, enabled: true } },
    );
    expect(polluted.errors).toBeUndefined();

    // In this process, where the service runs: every settings row now
    // inherits the channel, though no row's own field was written.
    expect(UserSettingsEntity.prototype.webhook).toBe(true);
    expect(({} as { webhook?: boolean }).webhook).toBeUndefined();
    const settings = await aliceSettings();
    expect(settings.webhook).toBe(false);
  });

  test('counterpart 1: setChannel takes an enum, and nothing is polluted', async () => {
    await reset();

    const refused = await query(
      'mutation($name: ChannelName!, $enabled: Boolean!) { setChannel(name: $name, enabled: $enabled) { webhook } }',
      { token: alice(), variables: { name: path, enabled: true } },
    );

    // The enum refuses the value by name: no path the caller wrote reaches the row.
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain('ChannelName');
    expect(UserSettingsEntity.prototype.webhook).toBeUndefined();
    expect(({} as { webhook?: boolean }).webhook).toBeUndefined();
  });

  test('counterpart 2: setChannels refuses both properties, and nothing is polluted', async () => {
    await reset();

    const refused = await query(
      'mutation($input: ChannelsInput!) { setChannels(input: $input) { webhook } }',
      { token: alice(), variables: { input: { path, enabled: true } } },
    );

    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain('path');
    expect(UserSettingsEntity.prototype.webhook).toBeUndefined();
    expect(({} as { webhook?: boolean }).webhook).toBeUndefined();
  });
});
