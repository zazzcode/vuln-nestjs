import { RemoteGraphQLDataSource } from '@apollo/gateway';
import type { ServiceName } from '@zazzles/exchange-config';
import {
  Http2ClientService,
  callService,
  fetcherFor,
} from '@zazzles/exchange-http2';
import { SERVICE_TOKEN_HEADER } from '@zazzles/exchange-internal-auth';

type WillSendRequest = NonNullable<RemoteGraphQLDataSource['willSendRequest']>;

/** What identifies the caller, and nothing else, crosses to the service that owns a field. */
const FORWARDED_HEADERS: readonly string[] = ['authorization', 'cookie'];

/**
 * A subgraph as the gateway reaches it. Schema discovery and every query go
 * through one fetcher, so the transport is decided here, once per service:
 * HTTP/2 cleartext for a service that speaks it, HTTP/1.1 for the rest.
 *
 * Every fetch presents the internal service token, so that a subgraph can tell
 * the gateway from any other caller of its federation queries (`_entities`,
 * `_service`). That is the gateway's half of GQL-007's hardened value; the
 * subgraph's half, requiring the token on those queries, is what closes it.
 */
export class SubgraphDataSource extends RemoteGraphQLDataSource {
  private readonly internalToken: string;

  constructor(
    service: ServiceName,
    url: string,
    client: Http2ClientService,
    internalToken: string,
  ) {
    const fetcher = fetcherFor(client, service);
    super({
      url,
      fetcher: (requestUrl, init) =>
        callService(service, (signal) =>
          fetcher(requestUrl, { ...init, signal }),
        ),
    });
    this.internalToken = internalToken;
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
    request.http.headers.set(SERVICE_TOKEN_HEADER, this.internalToken);
  }
}
