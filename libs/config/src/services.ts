/** What a service speaks on its listener. HTTP/2 wherever both ends are ours and can. */
export type Transport = 'http1' | 'http2';

export interface ServiceDefinition {
  /** The environment variable that holds the port. */
  readonly portVariable: string;
  readonly defaultPort: number;
  readonly transport: Transport;
}

/**
 * The service registry. The transport is a property of the service and is
 * decided once, here: a caller never chooses it per call.
 */
export const services = {
  gateway: {
    portVariable: 'GATEWAY_PORT',
    defaultPort: 3000,
    transport: 'http1',
  },
  accounts: {
    portVariable: 'ACCOUNTS_PORT',
    defaultPort: 3101,
    transport: 'http2',
  },
  trading: {
    portVariable: 'TRADING_PORT',
    defaultPort: 3102,
    transport: 'http2',
  },
  notifications: {
    portVariable: 'NOTIFICATIONS_PORT',
    defaultPort: 3103,
    transport: 'http1',
  },
} as const satisfies Record<string, ServiceDefinition>;

export type ServiceName = keyof typeof services;

/** The base URL of a service, from the port it listens on. */
export function serviceUrl(service: ServiceName, port: number): string {
  return `http://127.0.0.1:${port}`;
}
