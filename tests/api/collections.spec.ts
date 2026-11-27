import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  collectionsUnder,
  environmentFor,
  environmentKeysIn,
  requestsIn,
  variablesIn,
} from './collections.js';

const collections = collectionsUnder();

/** What a run of the lab looks like to the runner, without starting one. */
const lab = {
  url: 'http://127.0.0.1:3000',
  secrets: {
    JWT_SECRET: 'a-secret-of-a-run',
    INTERNAL_SERVICE_TOKEN: 'a-token-of-a-run',
  },
  http1Url: (service: string) => `http://127.0.0.1:${service}`,
};

// Checked without Newman: a collection that asks for a variable nobody provides, or that sends a
// request it asserts nothing about, would pass a run without testing anything.
describe('the Postman collections', () => {
  test('one for each microservice, and one for the gateway', () => {
    expect(collections.map((collection) => collection.service)).toEqual([
      'accounts',
      'gateway',
      'notifications',
      'trading',
    ]);
  });

  describe.each(collections)('the $service collection', (collection) => {
    const read = () => JSON.parse(readFileSync(collection.file, 'utf8'));

    test('asks only for the variables a run provides', () => {
      const provided = new Set(environmentFor(lab).map((v) => v.key));

      expect(variablesIn(read()).filter((name) => !provided.has(name))).toEqual(
        [],
      );
    });

    test('asserts something about every request it sends', () => {
      const requests = requestsIn(read());

      expect(requests.length).toBeGreaterThan(0);
      for (const { name, event = [] } of requests) {
        expect(
          event.some(
            (item) => item.listen === 'test' && item.script.exec.length > 0,
          ),
          `${name} is sent without a test script`,
        ).toBe(true);
      }
    });
  });

  test('declare, in the environment a person imports, the same variables a run provides', () => {
    expect([...environmentKeysIn()].sort()).toEqual(
      environmentFor(lab)
        .map((variable) => variable.key)
        .sort(),
    );
  });
});

describe('the variables a run provides', () => {
  test('reach each microservice over HTTP/1.1: through its relay where it speaks HTTP/2', () => {
    const variables = Object.fromEntries(
      environmentFor(lab).map((variable) => [variable.key, variable.value]),
    );

    expect(variables).toMatchObject({
      gatewayUrl: 'http://127.0.0.1:3000',
      accountsUrl: 'http://127.0.0.1:accounts',
      tradingUrl: 'http://127.0.0.1:trading',
      notificationsUrl: 'http://127.0.0.1:notifications',
      internalToken: 'a-token-of-a-run',
    });
  });

  test('are tokens for three fake users, each different, signed with the secret of the run', () => {
    const variables = environmentFor(lab);
    const value = (key: string) =>
      variables.find((variable) => variable.key === key)?.value;

    expect(
      new Set([value('accessToken'), value('adminToken'), value('bobToken')])
        .size,
    ).toBe(3);
    for (const token of [value('accessToken'), value('adminToken')]) {
      const [header, payload] = (token ?? '').split('.');
      expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
        alg: 'HS256',
        typ: 'JWT',
      });
      expect(
        JSON.parse(Buffer.from(payload!, 'base64url').toString()),
      ).toMatchObject({
        sub: expect.stringMatching(/^u-(alice|admin|bob)$/),
        sid: expect.stringMatching(/^s-u-/),
      });
    }
  });
});

describe('the variables a collection asks for', () => {
  test('are found in a URL, in a header, in a body and in a script, each once', () => {
    expect(
      variablesIn({
        item: [
          {
            name: 'a folder',
            item: [
              {
                name: 'one',
                request: {
                  method: 'POST',
                  url: '{{accountsUrl}}/graphql?x={{accessToken}}',
                  header: [
                    { key: 'authorization', value: 'Bearer {{accessToken}}' },
                  ],
                  body: { raw: '{"query": "{{aQuery}}"}' },
                },
                event: [
                  {
                    listen: 'test',
                    script: {
                      exec: ["const before = pm.environment.get('aQuery');"],
                    },
                  },
                ],
              },
              {
                name: 'two',
                request: {
                  method: 'GET',
                  url: '{{gatewayUrl}}/api/v1/health',
                  header: [],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual(['aQuery', 'accessToken', 'accountsUrl', 'gatewayUrl']);
  });
});
