import { services, type ServiceName } from '@zazzles/exchange-config';

/** The backend services this gateway reaches: each composes into the graph and serves `/internal/*`. */
export const BACKENDS: readonly ServiceName[] = [
  'accounts',
  'trading',
  'notifications',
];

/** The port a service listens on, as this gateway was told. Each is the service's own variable. */
export function portOf(environment: object, service: ServiceName): number {
  return (environment as Record<string, unknown>)[
    services[service].portVariable
  ] as number;
}
