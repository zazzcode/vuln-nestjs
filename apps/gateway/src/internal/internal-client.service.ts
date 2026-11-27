import { Injectable } from '@nestjs/common';
import { Environment } from '../config/environment.js';
import { portOf } from '../config/ports.js';
import {
  Http2ClientService,
  callService,
  fetcherFor,
  readJson,
} from '@zazzles/exchange-http2';
import { SERVICE_TOKEN_HEADER } from '@zazzles/exchange-internal-auth';
import { serviceUrl, type ServiceName } from '@zazzles/exchange-config';

/**
 * The gateway's way to a backend service's `/internal/*`: always on the
 * system's behalf, so always with the service token, and always over the
 * transport the service speaks. This is the only client for another service
 * in the lab: a backend service has none (ADR-010).
 */
@Injectable()
export class InternalClientService {
  constructor(
    private readonly http2: Http2ClientService,
    private readonly environment: Environment,
  ) {}

  /** What a service says about itself and its store. */
  health(service: ServiceName): Promise<unknown> {
    return this.call(service, 'GET', '/internal/health');
  }

  /** Asks a service to return its store to the fake data. */
  reset(service: ServiceName): Promise<unknown> {
    return this.call(service, 'POST', '/internal/lab/reset');
  }

  private call(
    service: ServiceName,
    method: string,
    path: string,
  ): Promise<unknown> {
    const fetcher = fetcherFor(this.http2, service);
    return callService(service, (signal) =>
      fetcher(
        `${serviceUrl(service, portOf(this.environment, service))}${path}`,
        {
          method,
          signal,
          headers: {
            [SERVICE_TOKEN_HEADER]: this.environment.INTERNAL_SERVICE_TOKEN,
            accept: 'application/json',
          },
        },
      ).then((response) => readJson<unknown>(response)),
    );
  }

  /**
   * Carries a request to a service's `/internal/*` path as it arrived: the
   * method, the path, the query as written, the body as written, and the
   * headers that identify the caller. The service token travels with it, and
   * the service's status, content type and body come back for the edge to
   * return.
   */
  forward(
    service: ServiceName,
    method: string,
    path: string,
    options: {
      rawQuery?: string;
      body?: unknown;
      contentType?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<UpstreamAnswer> {
    const fetcher = fetcherFor(this.http2, service);
    const url = `${serviceUrl(service, portOf(this.environment, service))}${path}${options.rawQuery ? `?${options.rawQuery}` : ''}`;
    const headers: Record<string, string> = {
      accept: 'application/json, */*',
      ...(options.contentType ? { 'content-type': options.contentType } : {}),
      ...options.headers,
      [SERVICE_TOKEN_HEADER]: this.environment.INTERNAL_SERVICE_TOKEN,
    };
    return callService(service, (signal) =>
      fetcher(url, {
        method,
        signal,
        headers,
        body: serialize(options.body),
      }).then(readAnswer),
    );
  }
}

/** A service's answer, as the edge returns it. */
export interface UpstreamAnswer {
  status: number;
  contentType: string | undefined;
  /** Parsed for a JSON answer, the bytes as they came for any other. */
  body: unknown;
}

/** A body as the transport takes it: text and bytes as they are, anything else as JSON. */
function serialize(body: unknown): unknown {
  if (
    body === undefined ||
    body === null ||
    typeof body === 'string' ||
    body instanceof Buffer
  ) {
    return body;
  }
  return JSON.stringify(body);
}

async function readAnswer(response: Response): Promise<UpstreamAnswer> {
  const contentType = response.headers.get('content-type') ?? undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (contentType?.includes('json')) {
    let parsed: unknown = bytes.toString();
    try {
      parsed =
        bytes.toString() === '' ? undefined : JSON.parse(bytes.toString());
    } catch {
      // Not JSON after all: the bytes cross as they came.
    }
    return { status: response.status, contentType, body: parsed };
  }
  return { status: response.status, contentType, body: bytes };
}
