import { connect, constants } from 'node:http2';
import { setTimeout as delay } from 'node:timers/promises';
import { services, type ServiceName } from '@zazzles/exchange-config';

/**
 * The transport a listener speaks, from the registry: a service on its default
 * port speaks what the registry says, anything else HTTP/1.1.
 */
export function transportOf(url: string | URL): 'http1' | 'http2' {
  const name = (Object.keys(services) as ServiceName[]).find(
    (candidate) =>
      services[candidate].defaultPort === Number(new URL(url).port),
  );
  return name === undefined ? 'http1' : services[name].transport;
}

/** `fetch`, for either transport: HTTP/2 cleartext where the listener speaks it, the global `fetch` elsewhere. */
export async function request(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return transportOf(url) === 'http2'
    ? cleartextHttp2(new URL(url), init)
    : fetch(url, init);
}

/** A body as the bytes to send: text, or bytes in any form. A test sends nothing else. */
function bytesOf(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return Buffer.from(body as ArrayBuffer);
  }
  throw new TypeError('This helper sends a body as text or as bytes');
}

/** One HTTP/2 request over cleartext, with prior knowledge: that listener speaks nothing else. */
function cleartextHttp2(url: URL, init: RequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const session = connect(url.origin);
    session.on('error', reject);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    const stream = session.request({
      ':method': init.method ?? 'GET',
      ':path': `${url.pathname}${url.search}`,
      ...headers,
    });
    const chunks: Buffer[] = [];
    const responseHeaders = new Headers();
    let status = 0;
    const abort = () => {
      stream.close(constants.NGHTTP2_CANCEL);
      reject(new Error('The request was aborted'));
    };
    init.signal?.addEventListener('abort', abort, { once: true });
    const finish = () => init.signal?.removeEventListener('abort', abort);

    stream.on('response', (head) => {
      status = Number(head[':status']);
      for (const [name, value] of Object.entries(head)) {
        if (!name.startsWith(':')) {
          responseHeaders.append(
            name,
            Array.isArray(value) ? value.join(', ') : String(value),
          );
        }
      }
    });
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      finish();
      session.close();
      resolve(
        new Response(Buffer.concat(chunks), {
          status,
          headers: responseHeaders,
        }),
      );
    });
    stream.on('error', (error) => {
      finish();
      session.close();
      reject(error);
    });
    stream.end(init.body === undefined ? undefined : bytesOf(init.body));
  });
}

/** How long a service gets to say it is up. The first run on a machine downloads two database binaries first. */
export const HEALTH_TIMEOUT_MS = 300_000;

/** Resolves when the URL answers with a success status. Rejects when it has not after `timeoutMs`. */
export async function waitForHealth(
  url: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(2_000),
      });
      await response.body?.cancel();
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`${url} did not answer within ${timeoutMs} ms`);
    }
    await delay(100);
  }
}
