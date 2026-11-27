// What the API runner needs to run the Postman collections under Newman, and what a unit test
// can check about them without starting anything: where the collections are, the variables a run
// gives them, and the variables they ask for.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionToken } from '@zazzles/exchange-testing';
import type { LabRun } from '../e2e/lab.js';

/** `postman/`: one folder per microservice, holding that microservice's collection. */
export const postmanDirectory = fileURLToPath(
  new URL('../../postman/', import.meta.url),
);

/** The environment a person imports into Postman, next to the collections. */
export const environmentFile = path.join(
  postmanDirectory,
  'local.postman_environment.json',
);

export interface Collection {
  /** The microservice the collection calls. */
  service: string;
  file: string;
}

/** Every collection under `postman/`, by the folder it is in. */
export function collectionsUnder(directory = postmanDirectory): Collection[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((folder) =>
      readdirSync(path.join(directory, folder.name))
        .filter((file) => file.endsWith('.postman_collection.json'))
        .map((file) => ({
          service: folder.name,
          file: path.join(directory, folder.name, file),
        })),
    )
    .sort((first, second) => first.service.localeCompare(second.service));
}

export interface Variable {
  key: string;
  value: string;
}

/**
 * The variables a collection is run with: where this run of the lab
 * listens, and the tokens of the run. `accessToken` is Alice's,
 * `adminToken` an administrator's, `bobToken` Bob's, each signed as the lab
 * signs its own. `internalToken` is the run's service token. They are made
 * for one run and written nowhere: the start command prints no secret.
 */
export function environmentFor(
  lab: Pick<LabRun, 'url' | 'secrets' | 'http1Url'>,
): Variable[] {
  const token = (sub: string, role: 'ADMIN' | 'USER') =>
    sessionToken(lab.secrets.JWT_SECRET, { sub, sid: `s-${sub}`, role });
  return [
    { key: 'gatewayUrl', value: lab.url },
    { key: 'accountsUrl', value: lab.http1Url('accounts') },
    { key: 'tradingUrl', value: lab.http1Url('trading') },
    { key: 'notificationsUrl', value: lab.http1Url('notifications') },
    { key: 'accessToken', value: token('u-alice', 'USER') },
    { key: 'adminToken', value: token('u-admin', 'ADMIN') },
    { key: 'bobToken', value: token('u-bob', 'USER') },
    { key: 'internalToken', value: lab.secrets.INTERNAL_SERVICE_TOKEN },
  ];
}

/** The keys the committed Postman environment declares. */
export function environmentKeysIn(file = environmentFile): string[] {
  const environment = JSON.parse(readFileSync(file, 'utf8')) as {
    values: { key: string }[];
  };
  return environment.values.map((value) => value.key);
}

/** A request of a collection, as far as the runner reads it. */
export interface Request {
  name: string;
  request: {
    method: string;
    url: string;
    header: { key: string; value: string }[];
    body?: { raw?: string };
  };
  event?: { listen: string; script: { exec: string[] } }[];
}

/** Every request of a collection, under whatever folders it holds them. */
export function requestsIn(collection: { item: unknown[] }): Request[] {
  const flatten = (items: unknown[]): Request[] =>
    items.flatMap((item) => {
      const entry = item as { item?: unknown[]; request?: Request['request'] };
      return entry.request === undefined
        ? flatten(entry.item ?? [])
        : [entry as Request];
    });
  return flatten(collection.item);
}

/** The variables a collection asks for: `{{name}}` anywhere in a request, or read from the environment by a script. */
export function variablesIn(collection: { item: unknown[] }): string[] {
  const asked = (text: string) =>
    [
      ...text.matchAll(/\{\{([^{}]+)\}\}/g),
      ...text.matchAll(
        /pm\.(?:environment|variables|collectionVariables)\.get\(\s*['"]([^'"]+)['"]/g,
      ),
      ...text.matchAll(
        /(?:environment|variables|collectionVariables)\.set\(\s*['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1].trim());
  const names = new Set<string>();
  for (const { request, event = [] } of requestsIn(collection)) {
    for (const text of [
      request.url,
      ...request.header.map((header) => header.value),
      request.body?.raw ?? '',
      ...event.flatMap((item) => item.script.exec),
    ]) {
      for (const name of asked(text)) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}
