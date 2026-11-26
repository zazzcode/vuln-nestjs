import type { ServiceName } from '@zazzles/exchange-config';
import { services } from '@zazzles/exchange-config';
import type { Http2ClientService } from './http2-client.service.js';
import type { Fetcher } from './http2-client.service.js';

/**
 * The fetcher for a service, by the transport it speaks: HTTP/2 cleartext for
 * `accounts` and `trading`, the global `fetch` for the rest.
 */
export function fetcherFor(
  client: Http2ClientService,
  service: ServiceName,
): Fetcher {
  if (services[service].transport === 'http2') {
    return (url, init) => client.fetch(url, init);
  }
  return (url, init) => fetch(url, init as RequestInit);
}
