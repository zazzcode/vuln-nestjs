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

describe('FS-003: any type accepted, HTML included', () => {
  const upload = () =>
    multipart(
      'file',
      'marker.html',
      '<script>window.__zazzles = "zazzles-lab-marker"</script>\n',
      'text/html',
    );

  test('POST /internal/documents/legacy accepts the HTML upload', async () => {
    const { headers, body } = upload();
    const response = await call(lab, '/internal/documents/legacy', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...headers },
      body,
    });

    // gained: an HTML document is stored, its content type the uploader's word
    expect(response.status).toBe(201);
    const answer = (await response.json()) as {
      originalName: string;
      mimeType: string;
    };
    expect(answer.originalName).toBe('marker.html');
    expect(answer.mimeType).toBe('text/html');
  });

  test('the safe upload refuses the extension', async () => {
    const { headers, body } = upload();
    const response = await call(lab, '/internal/documents', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...headers },
      body,
    });

    // refused: the allowlist is png, jpg, pdf and txt — nothing else
    expect(response.status).toBe(400);
    const refusal = (await response.json()) as { message: string };
    expect(refusal.message).toContain('A document ends in');
  });

  test('the checked route refuses a lying extension too', async () => {
    const png = multipart(
      'file',
      'marker.png',
      '<script>window.__zazzles = "zazzles-lab-marker"</script>\n',
      'image/png',
    );
    const response = await call(lab, '/internal/documents/checked', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...png.headers },
      body: png.body,
    });

    // refused: the bytes must start with the signature the extension claims
    expect(response.status).toBe(400);
    const refusal = (await response.json()) as { message: string };
    expect(refusal.message).toContain('signature');
  });
});

describe('XSS-002: the stored upload served inline as its stored type', () => {
  test('GET /internal/documents/file/marker.html/view renders as text/html', async () => {
    const { headers, body } = multipart(
      'file',
      'marker.html',
      '<script>window.__zazzles = "zazzles-lab-marker"</script>\n',
      'text/html',
    );
    const stored = await call(lab, '/internal/documents/legacy', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...headers },
      body,
    });
    const record = (await stored.json()) as { id: string };

    const response = await call(
      lab,
      '/internal/documents/file/marker.html/view',
      { headers: bearer(lab.aliceToken) },
    );
    const page = await response.text();

    // gained: the script rides to the browser as a page of this origin —
    // inline, text/html, and nothing tells the browser not to run it
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBeNull();
    expect(page).toContain('window.__zazzles = "zazzles-lab-marker"');

    // the same document through the counterparts
    const asAttachment = await call(
      lab,
      `/internal/documents/${record.id}/view`,
      { headers: bearer(lab.aliceToken) },
    );
    expect(asAttachment.headers.get('content-disposition')).toBe('attachment');
    expect(asAttachment.headers.get('x-content-type-options')).toBe('nosniff');

    const asImage = await call(lab, `/internal/documents/${record.id}/image`, {
      headers: bearer(lab.aliceToken),
    });
    expect(asImage.status).toBe(415);
  });
});

describe('XSS-004: a stored display name rendered unescaped', () => {
  const storedName = () =>
    'Alice<script>window.__zazzles = "zazzles-lab-marker"</script>';

  test('GET /internal/admin/users-html renders the stored markup as markup', async () => {
    await call(lab, '/internal/profile', {
      method: 'PATCH',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: storedName() }),
    });

    const response = await call(lab, '/internal/admin/users-html', {
      headers: bearer(lab.adminToken),
    });
    const page = await response.text();

    // gained: the stored script reaches the administrator's browser as part
    // of the page, unescaped, with nothing telling the browser not to run it
    expect(response.status).toBe(200);
    expect(page).toContain(storedName());
    expect(page).not.toContain('&lt;script&gt;');

    // the lab is put back as it was
    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('the JSON users route answers data, and says nosniff', async () => {
    const response = await call(lab, '/internal/admin/users', {
      headers: bearer(lab.adminToken),
    });
    const users = (await response.json()) as { displayName: string }[];

    // refused as a page: the display names are data in JSON, and the header
    // says the browser may not read the answer as anything else
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(
      users.some((user) => user.displayName.includes('<script>')),
    ).toBe(false);
  });

  test('the directory page escapes every value and allows nothing', async () => {
    await call(lab, '/internal/profile', {
      method: 'PATCH',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: storedName() }),
    });
    const response = await call(lab, '/internal/admin/directory', {
      headers: bearer(lab.adminToken),
    });
    const page = await response.text();

    // refused: the template escapes what it shows, and the page's content
    // security policy allows no script at all
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'",
    );
    expect(page).toContain('&lt;script&gt;');
    expect(page).not.toContain(storedName());

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });
});
