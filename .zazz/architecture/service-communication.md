# Service communication

**Status:** revised on 2026-11-26. The gateway-on-Fastify parts were run in a spike the same day. Revised again that day, once the scaffolding ran, for the relays in front of the two services on HTTP/2 ([ADR-012](decisions/ADR-012-http1-relay-in-front-of-http2-services.md)).

## 1. Principles

1. **A star.** The gateway talks to every service. **Services never call each other.** A flow that needs two services is two calls made by the client.
2. **Clients see one address.** The application's client uses the gateway's `127.0.0.1:3000` and nothing else. A tool that calls a service directly uses the service's own listener, or, for a service on HTTP/2, the relay in front of it.
3. **GraphQL federation carries the data API.** REST carries what a graph does not carry well: cookies, file uploads and downloads, CSV, HTML pages.
4. **HTTP/2 wherever both ends are ours and can speak it.** The gateway and two services talk HTTP/2. The Express service cannot, so it and its caller use HTTP/1.1.
5. **One port per service.** Each backend service serves its subgraph at `/graphql` and its internal REST endpoints at `/internal/*` on the same listener.
6. **Identity is verified at every hop.** A service does not take the gateway's word for who the caller is.

What is deliberately absent, because the application is started, exercised and stopped within minutes: retries, circuit breakers, request tracing, message queues, caching.

## 2. The edge: HTTP/1.1

| Property | Value | Why |
| --- | --- | --- |
| Protocol | HTTP/1.1, cleartext | curl, Postman, Newman and Burp negotiate HTTP/2 only over TLS. The lab has no TLS, and those tools do not speak HTTP/2 without it |
| Bind | `127.0.0.1` only | Nothing outside the machine can connect |
| Endpoints | `POST` and `GET /graphql`, `/api/v1/*`, `/docs` | [gateway.md](../project/services/gateway.md#4-api) |
| Body limit | Fastify default (1 MiB) | The functional baseline does not raise it |

## 3. The graph: Apollo Federation 2

### Packages

| Concern | Package | Version, 2026-11-26 |
| --- | --- | --- |
| Decorators and schema generation, code first | `@nestjs/graphql` | 14.2.2 |
| Apollo drivers (`ApolloFederationDriver`, `ApolloGatewayDriver`) | `@nestjs/apollo` | 14.2.2. Requires Apollo Server 5 |
| HTTP server for each subgraph and for the gateway | `@apollo/server` | 5.5.2 |
| Apollo's integration with Fastify | `@as-integrations/fastify` | 3.1.0 |
| Apollo's integration with Express 5 | `@as-integrations/express5` | 1.1.2 |
| Composition and query planning | `@apollo/gateway` | 2.14.5 |
| Federation directives | `@apollo/subgraph` | 2.17.0 |
| Schema language and execution | `graphql` | 16.15.0 |

### Subgraphs

Each backend service registers `ApolloFederationDriver` with `autoSchemaFile: { federation: 2 }`. An entity carries `@Directive('@key(fields: "…")')` and a `@ResolveReference()` method. A service that adds fields to another service's entity declares that entity with `@key` on the key field and resolves only its own fields.

A field that returns an entity reference needs `@provides` for the key, or composition fails:

```ts
@ObjectType()
@Directive('@key(fields: "id")')
export class Order {
  @Field(() => ID)
  id: string;

  @Field(() => User)
  @Directive('@provides(fields: "id")') // without it: "the key field(s) cannot be resolved from subgraph"
  user?: User;
}
```

The adapter changes none of this. The same decorators produce the same schema on Fastify and on Express.

### Gateway

```ts
// Sketch, run in the spike of 2026-11-26 with schema-first definitions.
GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
  driver: ApolloGatewayDriver,
  context: ({ req }) => ({ headers: req.headers }),
  gateway: {
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: 'accounts', url: 'http://127.0.0.1:3101/graphql' },
        { name: 'trading', url: 'http://127.0.0.1:3102/graphql' },
        { name: 'notifications', url: 'http://127.0.0.1:3103/graphql' },
      ],
    }),
    buildService: (definition) =>
      new SubgraphDataSource({ url: definition.url, fetcher: fetcherFor(definition.name) }),
  },
})
```

- **Composition at start.** `IntrospectAndCompose` asks each running subgraph for its schema and composes the supergraph when the gateway boots. The launcher guarantees the services are up first.
- **The transport is decided once, in `buildService`.** `IntrospectAndCompose` has no `fetcher` per subgraph: schema discovery goes through the data source that `buildService` returns, exactly as every planned query does. `fetcherFor` reads the service registry and returns the HTTP/2 fetch for `accounts` and `trading`, and the standard `fetch` for `notifications`.
- **Header forwarding.** A `willSendRequest` hook copies an allowlist from the incoming request: `authorization` and `cookie`. Nothing else crosses.
- **No subscriptions.** The Apollo gateway does not forward them.

### What a subgraph does with a request

A subgraph cannot tell whether a request came from the gateway. It applies the same rules to every request: read the token, verify it, apply the resolver's guards. What a direct caller gains is the federation queries `_entities` and `_service`, which the gateway keeps out of the public schema. That is scenario GQL-007.

### Developer conveniences are on

The gateway serves introspection and GraphiQL, accepts batched requests, sets no depth limit, and returns stack traces in errors. These are scenarios GQL-001 to 004.

## 4. HTTP/2, and where it is HTTP/1.1

### Server side

`accounts` and `trading` create their listener with `new FastifyAdapter({ http2: true })`. Without TLS options this is HTTP/2 with prior knowledge. `notifications` creates its listener with `new ExpressAdapter()`, which makes an HTTP/1.1 server. The gateway stays on HTTP/1.1 for clients.

### Client side

NestJS's microservices package has no HTTP/2 transport. The gateway uses Node's built-in `node:http2` module, wrapped once in `libs/http2`:

| Export | Shape | Used by |
| --- | --- | --- |
| `http2Fetch` | The WHATWG `fetch` signature, built on `http2.connect`. Cast once to the gateway's `Fetcher` type, which is narrower than the global `fetch` | The Apollo data source, for the Fastify subgraphs |
| `Http2ClientService` | `request<T>(method, url, { body, headers })` | The gateway's REST pass-through to Fastify services |

For `notifications` the same call sites use the global `fetch`, chosen by the service registry.

### Relays

curl, Postman, Newman and Burp speak HTTP/2 only over TLS, and the lab has none, so none of them reaches `accounts` or `trading` on their own addresses. The start command opens one relay in front of each ([ADR-012](decisions/ADR-012-http1-relay-in-front-of-http2-services.md)). It is `scripts/relay.mjs`, in the launcher's own process, and it depends on Node alone.

| Relay | Listens on | Carries to | Moved by |
| --- | --- | --- | --- |
| `accounts` | `127.0.0.1:3201`, HTTP/1.1 | `127.0.0.1:3101` over HTTP/2 | `ACCOUNTS_RELAY_PORT` |
| `trading` | `127.0.0.1:3202`, HTTP/1.1 | `127.0.0.1:3102` over HTTP/2 | `TRADING_RELAY_PORT` |

A relay decides nothing. The method, the path, the headers and the body are the caller's, and the status, the headers and the body are the service's. Hop-by-hop headers do not cross, and neither does the caller's `Host`: the service is asked for its own address, as the gateway asks it, so it cannot tell that a request arrived through a relay. Each request gets a connection of its own to the service, closed once the answer has been read to its end, or once the caller goes away. When the service does not answer, the relay answers `502` in the lab's error shape.

A relay opens before its service and closes before anything else stops. The end-to-end suite fails unless nothing listens where one was.

### Timeouts and failures

| Setting | Value | Behaviour |
| --- | --- | --- |
| Timeout | 10 s per call | The caller throws `ServiceUnavailableException`. In GraphQL this is `extensions.code: "SERVICE_UNAVAILABLE"` |
| Retries | None | If a service is down, the call fails and the lab is restarted |

### Why not gRPC, the NestJS microservices package, or HTTP/2 on Express

| Option | Why not |
| --- | --- |
| gRPC (`Transport.GRPC`) | Adds protobuf files and a third API paradigm beside the graph and REST |
| Another NestJS transport (TCP, Redis, …) | Not HTTP/2, and needs a broker for most of them |
| HTTP/2 on the Express service | NestJS's Express adapter creates an `http` or an `https` server. Mounting Express on Node's compatibility API would work around that, and is not worth it |

## 5. Internal REST contract

### Request

| Part | Rule |
| --- | --- |
| Path | `/internal/…` on the service's own port |
| Body | JSON, UTF-8. Multipart for uploads |
| `authorization` | `Bearer <access token>` when the call is made on a user's behalf |
| `x-internal-token` | The shared service token when the call is the system's |

### Response

| Part | Rule |
| --- | --- |
| Success | `200` or `201` with a JSON body, or a file |
| Failure | The NestJS shape `{ statusCode, message, error }` and a `code` from [api-design.md](api-design.md#5-errors). Never a stack |

### Endpoints

Every `/internal/*` path, with the gateway path that leads to it, is defined in the service specifications: [accounts](../project/services/accounts.md#4-api), [trading](../project/services/trading.md#4-api), [notifications](../project/services/notifications.md#4-api). Every service also serves `GET /internal/health` and `POST /internal/lab/reset`.

## 6. Identity propagation

| Call type | Credential | How the receiver checks it |
| --- | --- | --- |
| Client → gateway → service | The client's `Authorization` header or session cookie, forwarded | The service verifies the JWT and checks the session |
| Gateway → service, on the system's behalf | `x-internal-token` | Compared in constant time with the service's own configuration value |
| Launcher → service | None | The launcher only reads `/internal/health` |
| Tool → relay → service | The caller's own credential, carried unchanged | The service checks it as it does for any request. The relay holds no credential and decides nothing |

The rules that make this hold, and the places the scenarios deliberately break them, are in [security-model.md](security-model.md).

## 7. Outbound: webhooks

`notifications` delivers to the webhook URL a user saved. Behind the functional baseline a URL must pass an outbound guard: `http` or `https`, a host that resolves to loopback, a port on `WEBHOOK_ALLOWED_ORIGINS`, no redirects, a 5 second timeout. The delivery is signed (`X-Zazzles-Signature`, HMAC-SHA256 over the raw body). The client is `node-fetch` 2.7.0 over HTTP/1.1.

## 8. Startup order

| Constraint | Consequence |
| --- | --- |
| The gateway composes at start | The three services must be healthy before the gateway boots. The launcher starts them in order and waits |
| A relay is a caller of its service | The relays open first, and close first when the lab stops, before the gateway |
| A service that is down | Every call to it fails with `SERVICE_UNAVAILABLE`. The others are unaffected. The answer is to restart the lab |
