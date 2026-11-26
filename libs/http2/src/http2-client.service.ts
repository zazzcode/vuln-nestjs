import {
  HttpException,
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientHttp2Session, connect, constants } from 'node:http2';

/** A request as this client takes it: the WHATWG shape. A body is text, or bytes in any form Node knows. */
export type FetchInit = Omit<RequestInit, 'body'> & { body?: unknown };

/** The signature of the global `fetch`, taking a body as a GraphQL data source passes one: text, or bytes in any form. */
export type Fetcher = (url: string, init?: FetchInit) => Promise<Response>;

/** How long a service has to answer. Then the caller reports it unavailable. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The gateway's way to the services whose listener speaks HTTP/2 cleartext.
 * One session per origin, reused, and closed when the application stops.
 */
@Injectable()
export class Http2ClientService implements OnApplicationShutdown {
  private readonly sessions = new Map<string, ClientHttp2Session>();

  /** The WHATWG `fetch` signature over `node:http2`. */
  async fetch(url: string | URL, init: FetchInit = {}): Promise<Response> {
    const target = new URL(url);
    if (target.protocol !== 'http:') {
      throw new TypeError(
        `HTTP/2 cleartext speaks to an http: origin, received ${target.origin}`,
      );
    }
    const method = (init.method ?? 'GET').toUpperCase();
    const body = toBytes(init.body);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    if (body) {
      headers['content-length'] = String(body.length);
    }

    return new Promise<Response>((resolve, reject) => {
      const stream = this.session(target.origin).request({
        [constants.HTTP2_HEADER_METHOD]: method,
        [constants.HTTP2_HEADER_PATH]: `${target.pathname}${target.search}`,
        ...headers,
      });
      const chunks: Buffer[] = [];
      const responseHeaders = new Headers();
      let status = 0;
      let settled = false;
      const abort = () => stream.close(constants.NGHTTP2_CANCEL);
      init.signal?.addEventListener('abort', abort, { once: true });
      const release = () => init.signal?.removeEventListener('abort', abort);

      stream.on('response', (head) => {
        status = Number(head[':status']);
        for (const [name, value] of Object.entries(head)) {
          if (name.startsWith(':')) continue;
          responseHeaders.append(
            name,
            Array.isArray(value) ? value.join(', ') : String(value),
          );
        }
      });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        settled = true;
        release();
        if (status < 200 || status > 599) {
          reject(
            new Error(
              `${method} ${target.pathname} was answered with status ${status}`,
            ),
          );
          return;
        }
        try {
          resolve(
            new Response(Buffer.concat(chunks), {
              status,
              headers: responseHeaders,
            }),
          );
        } catch (error) {
          reject(error);
        }
      });
      stream.on('error', (error) => {
        settled = true;
        release();
        reject(error);
      });
      // A stream that closes unanswered, as an aborted one does, must not leave the call hanging.
      stream.on('close', () => {
        if (!settled) {
          release();
          reject(
            new Error(
              `${method} ${target.pathname} was closed before it was answered`,
            ),
          );
        }
      });
      stream.end(body);
    });
  }

  /**
   * A JSON call to a service. Resolves with the parsed answer. A transport
   * failure rejects with `ServiceUnavailableException`; an error status with
   * what the service answered, under that status.
   */
  async request<T>(
    method: string,
    url: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...init.headers,
    };
    let body: unknown;
    if (init.body !== undefined && init.body !== null) {
      if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
        // A body that is already bytes: a file, or what a client sent.
        headers['content-type'] ??= 'application/octet-stream';
        body = init.body;
      } else {
        headers['content-type'] ??= 'application/json';
        body = JSON.stringify(init.body);
      }
    }
    const response = await this.fetch(url, { method, headers, body });
    return readJson<T>(response);
  }

  async onApplicationShutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
  }

  private session(origin: string): ClientHttp2Session {
    const open = this.sessions.get(origin);
    if (open && !open.closed && !open.destroyed) {
      return open;
    }
    const created = connect(origin);
    created.on('close', () => this.sessions.delete(origin));
    // Its streams receive the error. An unhandled session error would end the process.
    created.on('error', () => created.destroy());
    this.sessions.set(origin, created);
    return created;
  }
}

/** A body as the bytes to send: text, or bytes in any form. Streams and multipart forms are not carried yet. */
function toBytes(body: unknown): Buffer | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new TypeError(
    `Cannot send a body of type ${Object.prototype.toString.call(body)} over HTTP/2`,
  );
}

/**
 * Reads a service's answer. A failure keeps the status and the message the
 * service gave, in the shape every REST error of the lab has.
 */
export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const parsed: unknown = text === '' ? undefined : parseJson(text);
  if (!response.ok) {
    const failure = isRecord(parsed) ? parsed : {};
    throw new HttpException(
      {
        statusCode: response.status,
        message: failure.message ?? text,
        error: failure.error ?? response.statusText,
      },
      response.status,
    );
  }
  return parsed as T;
}

/**
 * Calls a service on the system's behalf and reports its failures the way the
 * lab does: a service that is down or too slow is `ServiceUnavailableException`.
 * What the service itself answered is passed on untouched.
 */
export async function callService<T>(
  service: string,
  call: (signal: AbortSignal) => Promise<T>,
  ms = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await call(controller.signal);
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    const reason = controller.signal.aborted
      ? `did not answer within ${ms} ms`
      : `is unreachable (${describe(error)})`;
    throw new ServiceUnavailableException(`${service} ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
