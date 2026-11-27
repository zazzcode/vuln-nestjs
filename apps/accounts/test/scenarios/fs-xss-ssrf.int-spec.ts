import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { bearer, call, multipart, startLab, type Lab } from '../lab.js';
import { UploadsStore } from '../../src/documents/uploads.store.js';

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

describe('FS-002: the upload is stored under its own name', () => {
  test('POST /internal/documents/legacy writes outside the documents directory', async () => {
    const { headers, body } = multipart(
      'file',
      'outside-zazzles.txt',
      'written outside the upload directory\n',
      'text/plain',
    );
    const response = await call(
      lab,
      '/internal/documents/legacy?name=..%2Foutside-zazzles.txt',
      {
        method: 'POST',
        headers: { ...bearer(lab.aliceToken), ...headers },
        body,
      },
    );

    // gained: the write landed one directory up, wherever the uploader
    // pointed it — the answer says a document was stored
    expect(response.status).toBe(201);
    const { documents, root } = await lab.service.app
      .get(UploadsStore)
      .open();
    expect(existsSync(join(root, 'outside-zazzles.txt'))).toBe(true);
    expect(existsSync(join(documents, 'outside-zazzles.txt'))).toBe(false);
  });

  test('the safe upload stores the same file under a generated name, inside', async () => {
    const { headers, body } = multipart(
      'file',
      '../inside-zazzles.txt',
      'the same upload, the safe way\n',
      'text/plain',
    );
    const response = await call(lab, '/internal/documents', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...headers },
      body,
    });

    // refused: the uploader's name is data; the file that lands is named by
    // the service, inside the documents directory
    expect(response.status).toBe(201);
    const { documents, root } = await lab.service.app
      .get(UploadsStore)
      .open();
    const stored = readdirSync(documents).filter((name) =>
      /^[0-9a-f-]{36}\.txt$/.test(name),
    );
    expect(stored.length).toBeGreaterThan(0);
    expect(existsSync(join(root, 'inside-zazzles.txt'))).toBe(false);
  });

  test('the checked route does the same, and the name is checked before it is used', async () => {
    const { headers, body } = multipart(
      'file',
      '../checked-zazzles.txt',
      'the same upload, checked\n',
      'text/plain',
    );
    const response = await call(lab, '/internal/documents/checked', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...headers },
      body,
    });

    expect(response.status).toBe(201);
    const { documents, root } = await lab.service.app
      .get(UploadsStore)
      .open();
    expect(
      readdirSync(documents).some((name) => name.endsWith('.txt')),
    ).toBe(true);
    expect(existsSync(join(root, 'checked-zazzles.txt'))).toBe(false);
  });
});
