import { RemoteGraphQLDataSource } from '@apollo/gateway';
import type { ServiceName } from '@zazzles/exchange-config';
import {
  Http2ClientService,
  callService,
  fetcherFor,
} from '@zazzles/exchange-http2';

type WillSendRequest = NonNullable<RemoteGraphQLDataSource['willSendRequest']>;

/** What identifies the caller, and nothing else, crosses to the service that owns a field. */
const FORWARDED_HEADERS: readonly string[] = ['authorization', 'cookie'];

/**
 * A subgraph as the gateway reaches it. Schema discovery and every query go
 * through one fetcher, so the transport is decided here, once per service:
 * HTTP/2 cleartext for a service that speaks it, HTTP/1.1 for the rest.
 */
export class SubgraphDataSource extends RemoteGraphQLDataSource {
  constructor(service: ServiceName, url: string, client: Http2ClientService) {
    const fetcher = fetcherFor(client, service);
    super({
      url,
      fetcher: (requestUrl, init) =>
        callService(service, (signal) =>
          fetcher(requestUrl, { ...init, signal }),
        ),
    });
  }

  willSendRequest({ request, context }: Parameters<WillSendRequest>[0]): void {
    if (!request.http) {
      return;
    }
    const headers = (
      context as
        { headers?: Record<string, string | string[] | undefined> } | undefined
    )?.headers;
    for (const name of FORWARDED_HEADERS) {
      const value = headers?.[name];
      if (typeof value === 'string') {
        request.http.headers.set(name, value);
      }
    }
  }
}
