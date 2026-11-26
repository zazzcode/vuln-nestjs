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
}
