import 'reflect-metadata';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { JwtService } from '@nestjs/jwt';
import { createRequire } from 'node:module';
import { createServer as createHttpServer, type Server } from 'node:http';
import {
  createServer as createHttp2Server,
  type Http2Server,
} from 'node:http2';
import type { AddressInfo } from 'node:net';
import { labMarkets, labUsers } from '@zazzles/exchange-lab-data';
import { SERVICE_TOKEN_HEADER } from '@zazzles/exchange-internal-auth';
import { parse, print } from 'graphql';

const require = createRequire(import.meta.url);
const { graphql } = require('graphql') as typeof import('graphql');

/**
 * The three subgraphs as this gateway's tests stand them in: accounts and
 * trading over HTTP/2 in cleartext, notifications over HTTP/1.1, each with the
 * fake data of `@zazzles/exchange-lab-data` and the federation queries a real
 * subgraph answers. No real service runs.
 */

/** What one stand-in received, exactly as it arrived. */
export interface Reached {
  method: string | undefined;
  path: string | undefined;
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface StandIn {
  readonly service: 'accounts' | 'trading' | 'notifications';
  readonly server: Server | Http2Server;
  /** Known once the server listens. */
  port: number;
  readonly reached: Reached[];
  /** The federation queries refuse a caller without the internal token: GQL-007's subgraph half. */
  requireInternalToken: boolean;
  stop(): Promise<void>;
}

const ACCOUNTS = `
  type User @key(fields: "id") { id: ID! email: String! displayName: String! }
  type Query { me: User user(id: ID!): User }
`;

const TRADING = `
  scalar Decimal
  type Market @key(fields: "symbol") { symbol: String! referencePrice: Decimal! }
  type Order @key(fields: "id") { id: ID! userId: ID! symbol: String! limitPrice: Decimal user: User @provides(fields: "id") }
  type User @key(fields: "id") { id: ID! orders: [Order!]! }
  type Query { orders: [Order!]! markets: [Market!]! }
`;

const NOTIFICATIONS = `
  type Announcement @key(fields: "id") { id: ID! title: String! }
  type Query { announcements: [Announcement!]! }
`;

const users = Object.fromEntries(
  labUsers.map((user) => [
    user.id,
    { id: user.id, email: user.email, displayName: user.displayName },
  ]),
);

/** Two resting limit orders per user, as the trading seed spreads them. */
const orders = labUsers
  .filter((user) => user.role === 'USER')
  .flatMap((user, index) => {
    const market = labMarkets[index % labMarkets.length];
    const other = labMarkets[(index + 2) % labMarkets.length];
    return [
      {
        id: String(index + 1),
        userId: user.id,
        symbol: market.symbol,
        limitPrice: market.referencePrice,
      },
      {
        id: String(index + 6),
        userId: user.id,
        symbol: other.symbol,
        limitPrice: other.referencePrice,
      },
    ];
  });

const ordersOf = (userId: string) =>
  orders.filter((order) => order.userId === userId);

/** Who the caller is, from the authorization header the gateway forwarded. */
function callerOf(headers: Record<string, string | string[] | undefined>) {
  const authorization = headers.authorization;
  if (typeof authorization !== 'string') {
    return null;
  }
  const token = authorization.replace(/^Bearer /, '');
  try {
    const decoded = new JwtService({}).decode(token);
    if (decoded && typeof decoded === 'object' && 'sub' in decoded) {
      return String(decoded.sub);
    }
  } catch {
    // A stand-in does not verify; a token it cannot read has no caller.
  }
  return null;
}

function schemaOf(service: 'accounts' | 'trading' | 'notifications') {
  if (service === 'accounts') {
    return buildSubgraphSchema([
      {
        typeDefs: parse(ACCOUNTS),
        resolvers: {
          Query: {
            me: (
              _: unknown,
              __: unknown,
              context: {
                headers?: Record<string, string | string[] | undefined>;
              },
            ) => {
              const caller = callerOf(context.headers ?? {});
              return caller ? (users[caller] ?? null) : null;
            },
            user: (_: unknown, { id }: { id: string }) => users[id] ?? null,
          },
          User: {
            __resolveReference: (reference: { id: string }) =>
              users[reference.id] ?? null,
          },
        },
      },
    ]);
  }
  if (service === 'trading') {
    return buildSubgraphSchema([
      {
        typeDefs: parse(TRADING),
        resolvers: {
          Query: {
            orders: (
              _: unknown,
              __: unknown,
              context: {
                headers?: Record<string, string | string[] | undefined>;
              },
            ) => {
              const caller = callerOf(context.headers ?? {});
              return caller ? ordersOf(caller) : [];
            },
            markets: () =>
              labMarkets.map((market) => ({
                symbol: market.symbol,
                referencePrice: market.referencePrice,
              })),
          },
          Order: {
            user: (order: { userId: string }) => ({
              __typename: 'User',
              id: order.userId,
            }),
          },
          User: {
            __resolveReference: (reference: { id: string }) => ({
              ...reference,
            }),
            orders: (user: { id: string }) => ordersOf(user.id),
          },
        },
      },
    ]);
  }
  return buildSubgraphSchema([
    {
      typeDefs: parse(NOTIFICATIONS),
      resolvers: {
        Query: {
          announcements: () => [{ id: '1', title: 'Welcome to VCX' }],
        },
        Announcement: {
          __resolveReference: (reference: { id: string }) => ({
            ...reference,
            title: 'Welcome to VCX',
          }),
        },
      },
    },
  ]);
}

/** The federation queries a subgraph answers for the gateway. The marker is what GQL-007 is about. */
const FEDERATION_QUERY = /_(entities|service)\b/;

async function standIn(
  service: 'accounts' | 'trading' | 'notifications',
): Promise<StandIn> {
  const schema = schemaOf(service);
  const transport =
    service === 'notifications' ? ('http1' as const) : ('http2' as const);
  const server: Server | Http2Server =
    transport === 'http2' ? createHttp2Server() : createHttpServer();
  const reached: Reached[] = [];
  const standInSelf: StandIn = {
    service,
    server,
    port: 0,
    reached,
    requireInternalToken: false,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // An HTTP/1.1 server holds idle connections to close; an HTTP/2 server has no such method.
        if ('closeAllConnections' in server) {
          server.closeAllConnections();
        }
      });
    },
  };

  server.on('request', (request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      reached.push({
        method: request.method,
        path: request.url,
        protocol: request.httpVersion,
        headers: request.headers,
        body,
      });

      if (request.url === '/internal/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ok',
            service,
            store: { engine: 'a store', connected: true },
          }),
        );
        return;
      }

      const query =
        typeof (body as { query?: unknown })?.query === 'string'
          ? (body as { query: string }).query
          : print(parse('{ __typename }'));
      // GQL-007's subgraph half, as the stand-in plays it: the federation
      // queries are answered to the gateway only, on presentation of the
      // internal token. With requireInternalToken off, the stand-in plays the
      // services as they are today: it answers any caller.
      if (
        standInSelf.requireInternalToken &&
        FEDERATION_QUERY.test(query) &&
        request.headers[SERVICE_TOKEN_HEADER] === undefined
      ) {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            errors: [
              {
                message: `${service} refuses an unauthenticated federation query`,
              },
            ],
          }),
        );
        return;
      }

      // The answer is written when it arrives; this listener goes on to the next request.
      void graphql({
        schema,
        source: query,
        variableValues: (body as { variables?: Record<string, unknown> })
          ?.variables,
        contextValue: { headers: request.headers },
      }).then((result) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  standInSelf.port = (server.address() as AddressInfo).port;
  return standInSelf;
}

/** The three stand-ins, with their ports where the gateway's environment reads them. */
export async function standInSubgraphs(): Promise<{
  accounts: StandIn;
  trading: StandIn;
  notifications: StandIn;
  stopAll(): Promise<void>;
}> {
  const accounts = await standIn('accounts');
  const trading = await standIn('trading');
  const notifications = await standIn('notifications');
  process.env.ACCOUNTS_PORT = String(accounts.port);
  process.env.TRADING_PORT = String(trading.port);
  process.env.NOTIFICATIONS_PORT = String(notifications.port);
  return {
    accounts,
    trading,
    notifications,
    async stopAll() {
      await accounts.stop();
      await trading.stop();
      await notifications.stop();
    },
  };
}
