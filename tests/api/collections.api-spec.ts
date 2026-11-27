import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { useLab } from '../e2e/lab.js';
import { collectionsUnder, environmentFor, requestsIn } from './collections.js';
import { runUnderNewman } from './newman.js';

const collections = collectionsUnder();

// The same requests a person sends from Postman, against the lab as four processes. One lab for
// the file: a collection is run alone, and its result says which request and which assertion.
describe('the API collections, under Newman', () => {
  const lab = useLab();

  describe.each(collections)('the $service collection', (collection) => {
    test('sends every request, each goes through, and every assertion in the collection holds', async () => {
      const written = requestsIn(
        JSON.parse(readFileSync(collection.file, 'utf8')),
      );
      const run = await runUnderNewman(collection.file, environmentFor(lab()));

      expect(run.requests.map((request) => request.method)).toEqual(
        written.map((request) => request.request.method),
      );
      expect(
        run.requests.filter((request) => request.refused !== null),
      ).toEqual([]);
      expect(run.failures).toEqual([]);
    }, 120_000);
  });
});
