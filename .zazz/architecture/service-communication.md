# Service communication

**Status:** proposed in Phase 0. Code sketches are illustrations; Phase 1 verifies them on the installed packages.

## 1. Principles

1. **Clients see one address.** The gateway's `127.0.0.1:3000` is the only listener a client uses.
2. **GraphQL federation carries the data API.** A small REST surface carries what a graph does not carry well: cookies, file uploads and downloads, CSV, webhooks.
3. **HTTP/2 wherever both ends are ours and can speak it.** The three Fastify processes talk HTTP/2. The one Express service cannot, so it and its callers use HTTP/1.1.
4. **Identity is verified at every hop.** A service does not take the gateway's word for who the caller is.
5. **One port per service.** Each backend service serves its subgraph at `/graphql` and its internal REST endpoints at `/internal/*` on the same listener.

What is deliberately absent, because the application is started, exercised and stopped within minutes: retries, circuit breakers, request tracing, message queues, caching.

## 2. The edge: HTTP/1.1

| Property | Value | Why |
| --- | --- | --- |
| Protocol | HTTP/1.1, cleartext | curl, Postman, Newman and Burp negotiate HTTP/2 only over TLS. The lab has no TLS, and those tools do not speak HTTP/2 without it |
| Bind | `127.0.0.1` only | Nothing outside the machine can connect |
| Endpoints | `POST` and `GET /graphql`, `/api/v1/*`, `/docs` | See [api-design.md](api-design.md) |
| Body limit | Fastify default (1 MiB) | The functional baseline does not raise it |

## 3. The graph: Apollo Federation 2

### Packages

| Concern | Package | Verified version, 2026-11-26 |
| --- | --- | --- |
| Decorators and schema generation, code first | `@nestjs/graphql` | 14.2.2 |
| Apollo drivers (`ApolloFederationDriver`, `ApolloGatewayDriver`) | `@nestjs/apollo` | 14.2.2. Requires Apollo Server 5 |
| HTTP server for each subgraph and for the gateway | `@apollo/server` | 5.5.2 |
| Apollo's integration with Fastify, for the gateway and two subgraphs | `@as-integrations/fastify` | 3.1.0 |
| Apollo's integration with Express 5, for the Express subgraph | `@as-integrations/express5` | 1.1.2 |
| Composition and query planning | `@apollo/gateway` | 2.14.5 |
| Federation directives and the subgraph schema | `@apollo/subgraph` | 2.17.0 |
| Schema language and execution | `graphql` | 16.15.0, inside every declared peer range |

### Subgraphs

Each backend service registers `ApolloFederationDriver` with `autoSchemaFile: { federation: 2 }`. NestJS generates the subgraph schema from the decorated classes and adds the federation `@link` directive. An entity carries `@Directive('@key(fields: "…")')` and a `@ResolveReference()` method; a service that adds fields to another service's entity declares that entity with `@key` on the key field and resolves only its own fields.

The adapter does not change any of this. The same decorators produce the same schema on Fastify and on Express.

### Gateway

```ts
// Sketch. Phase 1 verifies it against the installed packages.
GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
  driver: ApolloGatewayDriver,
  context: ({ req }) => ({ headers: req.headers }),
  gateway: {
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: 'accounts', url: 'http://127.0.0.1:3101/graphql', fetcher: http2Fetch },
        { name: 'trading', url: 'http://127.0.0.1:3102/graphql', fetcher: http2Fetch },
        { name: 'notifications', url: 'http://127.0.0.1:3103/graphql' },
      ],
    }),
    buildService: (definition) =>
      new SubgraphDataSource({ url: definition.url, fetcher: fetcherFor(definition.name) }),
  },
})
```

- **Composition at start.** `IntrospectAndCompose` asks each running subgraph for its schema and composes the supergraph when the gateway boots. That needs the services up first, which the launcher guarantees. Apollo documents `IntrospectAndCompose` as a development convenience, and the official NestJS sample composes ahead of time into a file. For an application that lives for minutes and starts with one command, composing at start is the right tool.
- **The transport is a property of the service.** A service registry in `libs/config` records, for each service, its URL and whether it speaks HTTP/2. `fetcherFor` returns `http2Fetch` for `accounts` and `trading`, and the standard `fetch` for `notifications`. The `fetcher` on each subgraph entry covers schema discovery; `buildService` returns a `RemoteGraphQLDataSource` with the same fetcher, which covers every planned query.
- **Header forwarding.** A `willSendRequest` hook copies an allowlist from the incoming request: `authorization` and `cookie`. Nothing else crosses.
- **No subscriptions.** The Apollo gateway does not forward subscriptions to subgraphs. The graph has queries and mutations only.

### What a subgraph does with a request

A subgraph cannot tell whether a request came from the gateway. It applies the same rules to every request: read the bearer token or the session cookie, verify it, and apply the resolver's guards.

### Developer conveniences are on

The gateway serves introspection, GraphiQL, and batched requests. It sets no depth or complexity limit. These are deliberate: they are the lab's scenarios GQL-001 to 003, registered in Phase 8.

## 4. HTTP/2 inside, and where it is HTTP/1.1

### Server side

`accounts` and `trading` create their listener with `new FastifyAdapter({ http2: true })`. Without TLS options this is HTTP/2 with prior knowledge (h2c). The gateway stays on HTTP/1.1 for clients.

`notifications` creates its listener with `new ExpressAdapter()`. NestJS's Express adapter creates an HTTP/1.1 server; it has no option for cleartext HTTP/2. Mounting Express on Node's HTTP/2 compatibility server would work around that, and is not worth it for a sample application.

### Client side

NestJS's microservices package has transports for TCP, Redis, NATS, MQTT, Kafka, RabbitMQ and gRPC, and none for plain HTTP/2. The lab therefore uses Node's built-in `node:http2` module, wrapped once in the shared library `libs/http2`:

| Export | Shape | Used by |
| --- | --- | --- |
| `http2Fetch` | The WHATWG `fetch` signature (`(url, init) => Promise<Response>`), built on `http2.connect` | The Apollo gateway's `fetcher` and data source, for the Fastify subgraphs |
| `Http2ClientService` | `request<T>(method, url, { body, headers })` for JSON calls | The gateway's REST pass-through to Fastify services, and `trading` calling `accounts` |

For the Express service the same call sites use Node's global `fetch`, chosen by the service registry. Both keep a connection open and reuse it for the life of the process.

### Timeouts and failures

| Setting | Value | Behaviour |
| --- | --- | --- |
| Timeout | 10 s per call | The caller throws `ServiceUnavailableException`. In GraphQL this is `extensions.code: "SERVICE_UNAVAILABLE"` |
| Retries | None | Nothing is retried. If a service is down, the call fails and the lab is restarted |

### Why not gRPC or the NestJS microservices package

| Option | Why not |
| --- | --- |
| gRPC (`Transport.GRPC`) | Runs on HTTP/2, but adds protobuf files and a third API paradigm beside the graph and REST |
| Another NestJS transport (TCP, Redis, …) | Not HTTP/2, and needs a broker for most of them |
| HTTP/2 on the Express service | Needs TLS, or a workaround on a compatibility API. HTTP/1.1 to one service is the honest trade for adapter coverage |

## 5. Internal REST contract

### Request

| Part | Rule |
| --- | --- |
| Path | `/internal/…` on the service's own port |
| Body | JSON, UTF-8. Multipart for uploads |
| `authorization` | `Bearer <access token>` when the call is made on a user's behalf |
| `x-internal-token` | The shared service token when the call is made on the system's behalf (`trading` evaluating alerts, the gateway resetting) |

### Response

| Part | Rule |
| --- | --- |
| Success | `200` or `201` with a JSON body |
| Failure | The NestJS error shape `{ statusCode, message, error }` and a `code` from the list in [api-design.md](api-design.md#6-errors). Never a stack |

### Endpoints

| Service | Method and path | Caller | Purpose |
| --- | --- | --- | --- |
| all | `GET /internal/health` | gateway, launcher | `{ status, store }`, nothing else |
| all | `POST /internal/lab/reset` | gateway (service token) | Empty the store and load the fake data again |
| accounts | `POST /internal/wallets/:userId/hold` | trading (user token) | Move an amount from available to held |
| accounts | `POST /internal/wallets/:userId/release` | trading (user token) | Return a hold to available |
| accounts | `POST /internal/wallets/:userId/settle` | trading (service token) | Apply a debit and a credit atomically |
| accounts | `GET /internal/wallets/:userId` | trading (service token) | Read balances |
| accounts | `POST /internal/sessions` | gateway (no token) | Exchange email and password for tokens, for cookie sign-in |
| accounts | `GET /internal/reports/statements/:name` | gateway (user token) | Statement file download |
| accounts | `POST /internal/profile/avatar` | gateway (user token) | Fetch an avatar from a URL |
| accounts | `POST /internal/documents` | gateway (user token) | Document upload |
| trading | `GET /internal/reports/trades.csv` | gateway (user token) | CSV export |
| trading | `GET /internal/reports/files/:name` | gateway (user token) | Report file download |
| notifications | `POST /internal/alerts/evaluate` | trading (service token) | Evaluate alerts against new prices |
| notifications | `POST /internal/webhooks/test` | gateway (user token) | Send a test delivery |
| notifications | `POST /internal/announcements` | gateway (user token) | Create and send an announcement |

The Phase 2 to 4 specifications confirm names and payloads. A phase may add an endpoint; it may not reuse a path for another purpose.

## 6. Identity propagation

| Call type | Credential | How the receiver checks it |
| --- | --- | --- |
| Client → gateway → service | The client's `Authorization` header or session cookie, forwarded | The service verifies the JWT itself |
| Service → service, on a user's behalf | The same user token, forwarded by the calling service | Verified again by the receiving service |
| Service → service, on the system's behalf | `x-internal-token` | Compared in constant time with the service's own configuration value |
| Launcher → service | None | The launcher only reads `/internal/health` |

The rules that make this hold, and the places Phase 6 to 8 deliberately break them, are in [security-model.md](security-model.md).

## 7. Outbound: webhooks

`notifications` delivers to whatever URL an alert or a test names. In the functional baseline the URL must pass an allowlist: `http` or `https`, a host that resolves to loopback, no redirect following, a 5 second timeout. The delivery is signed (`X-Zazzles-Signature`, HMAC-SHA256 over the raw body) so a receiver can verify it.

The delivery client speaks HTTP/1.1, through `node-fetch` 2.7.0. A webhook receiver on loopback is an HTTP/1.1 test target, and nothing else is needed.

## 8. Startup order

| Constraint | Consequence |
| --- | --- |
| The gateway composes at start | The three services must be healthy before the gateway boots. The launcher starts them in order and waits |
| `trading` needs `accounts` for every order | If `accounts` is down, placing an order fails with `SERVICE_UNAVAILABLE`. The answer is to restart the lab |
