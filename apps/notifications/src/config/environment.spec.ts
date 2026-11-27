import { validateEnvironment } from '@zazzles/exchange-config';
import { Environment } from './environment.js';

const BASE = {
  JWT_SECRET: 'a-secret-of-at-least-thirty-two-characters',
  INTERNAL_SERVICE_TOKEN: 'another-secret-of-at-least-thirty-two',
};

describe('Environment', () => {
  test('defaults the webhook allowlist to the loopback test receiver', () => {
    const environment = validateEnvironment(Environment, BASE);

    expect(environment.WEBHOOK_ALLOWED_ORIGINS).toBe('http://127.0.0.1:4010');
    expect(environment.webhookOrigins).toEqual(['http://127.0.0.1:4010']);
  });

  test('splits and trims a list of origins', () => {
    const environment = validateEnvironment(Environment, {
      ...BASE,
      WEBHOOK_ALLOWED_ORIGINS:
        ' http://127.0.0.1:4010 , http://127.0.0.1:4020 ,',
    });

    expect(environment.webhookOrigins).toEqual([
      'http://127.0.0.1:4010',
      'http://127.0.0.1:4020',
    ]);
  });

  test('a missing secret stops the service', () => {
    expect(() => validateEnvironment(Environment, {})).toThrow(
      /Invalid environment/,
    );
  });

  test('a short secret stops the service', () => {
    expect(() =>
      validateEnvironment(Environment, { ...BASE, JWT_SECRET: 'too-short' }),
    ).toThrow(/JWT_SECRET/);
  });
});
