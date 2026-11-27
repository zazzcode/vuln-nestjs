import { afterAll, beforeAll, expect, test } from 'vitest';
import { bearer, call, gql, startLab, type Lab } from '../lab.js';

let lab: Lab;

beforeAll(async () => {
  lab = await startLab();
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
});

describe('FS-001: the file name is the path', () => {
  test('GET /internal/documents/file/..%2F..%2Fpackage.json answers the repository manifest', async () => {
    const response = await call(
      lab,
      '/internal/documents/file/..%2F..%2Fpackage.json',
      { headers: bearer(lab.aliceToken) },
    );
    const manifest = (await response.json()) as { name: string };

    // gained: a file outside anything the service owns — the repository's
    // own manifest, read through a document route
    expect(response.status).toBe(200);
    expect(manifest.name).toBe('vuln-nestjs');
  });

  test('the id route serves the record the database names, not the caller', async () => {
    const response = await call(lab, '/internal/documents/d-alice-avatar/view', {
      headers: bearer(lab.aliceToken),
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    // refused: there is no name to traverse with — the seeded PNG answers,
    // as an attachment, with the PNG signature it must have
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment');
    expect(bytes.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  test('the by-name route resolves and checks the stored path', async () => {
    const response = await call(
      lab,
      '/internal/documents/by-name/..%2F..%2Fpackage.json',
      { headers: bearer(lab.aliceToken) },
    );

    // refused: no document of the caller's carries that name, and the path
    // of one that did would still be checked against the directory
    expect(response.status).toBe(404);
  });
});
