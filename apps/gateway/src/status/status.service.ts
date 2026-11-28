import { Injectable } from '@nestjs/common';
import { BACKENDS } from '../config/ports.js';

/** The lab's own report of itself, as the status pages serve it. */
export interface StatusReport {
  status: 'ok';
  service: 'gateway';
  caller: string;
  backendServices: readonly string[];
}

/**
 * The status pages: one page of HTML, one of JSON. Both are rendered from a
 * fixed template, with the caller's `name` passed as data and escaped into the
 * page — the template decides where it appears, and the escaping decides what
 * it can carry.
 */
@Injectable()
export class StatusService {
  /** The JSON status. */
  report(name: string): StatusReport {
    return {
      status: 'ok',
      service: 'gateway',
      caller: name,
      backendServices: [...BACKENDS],
    };
  }

  /** The HTML page, from a fixed template with the name escaped into it. */
  page(name: string): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>VCX status</title>
  </head>
  <body>
    <h1>VCX status</h1>
    <p>ok — the gateway is up.</p>
    <p>Hello, ${escapeHtml(name)}.</p>
    <ul>
${BACKENDS.map((service) => `      <li>${service}</li>`).join('\n')}
    </ul>
  </body>
</html>
`;
  }
}

/** What HTML cannot carry: the characters a value is escaped against. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
