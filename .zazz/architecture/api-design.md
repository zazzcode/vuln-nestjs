# API design

**Status:** proposed in Phase 0. Field-level detail is finalized in the specification of the phase that builds each type.

## 1. Surface map

| Surface | Address | Who calls it | Built with |
| --- | --- | --- | --- |
| Federated GraphQL | `POST /graphql` and `GET /graphql` on the gateway | Any client | Apollo gateway on the Fastify adapter |
| REST | `/api/v1/*` and `/docs` on the gateway | Any client | Fastify controllers, OpenAPI through `@nestjs/swagger` |
| Subgraph | `POST /graphql` on each backend service's port | The gateway (and, on loopback, anyone else) | `ApolloFederationDriver`. Fastify for `accounts` and `trading`, Express for `notifications` |
| Internal REST | `/internal/*` on each backend service's port | The gateway and the other services | Fastify controllers, or Express controllers in `notifications` |

## 2. Conventions

| Concern | Rule |
| --- | --- |
| Names | GraphQL types in `PascalCase`, fields and arguments in `camelCase`. Mutations are verbs: `placeOrder`, `cancelOrder` |
| Identifiers | The GraphQL `ID` scalar, always a string. A client never sees a number |
| Money | The `Decimal` scalar: a string such as `"65000.00"`. Never `Float` |
| Time | The `DateTime` scalar: an ISO 8601 string in UTC |
| Input | `@InputType()` classes for mutations, with class-validator decorators, validated by the global `ValidationPipe` |
| Errors | `extensions.code` in GraphQL; the NestJS error shape in REST. See [Errors](#6-errors) |
| Pagination | `limit` and `offset`. The default `limit` is 50 and the functional baseline caps it at 200 |
| Versioning | REST is versioned by path (`/api/v1`). The graph is not versioned; the lab lives for minutes |

## 3. Adapter idioms per service

The same job looks different on the two adapters. That is part of what the lab shows.

| Job | Fastify: `gateway`, `accounts`, `trading` | Express: `notifications` |
| --- | --- | --- |
| JSON body | Fastify's built-in parser | `express.json()` as middleware |
| Cookies | `@fastify/cookie`, `reply.setCookie()` | `res.cookie()`, `cookie-parser` |
| File upload | `@fastify/multipart` | not used |
| Sending a file | `reply.send(stream)`; `@fastify/static` for a directory | `res.sendFile()`, `res.download()` |
| HTML | a template through `@fastify/view` | `res.render()` with `ejs` |
| Route-level validation | DTOs; optionally a JSON schema through `@RouteConfig()` | DTOs |
| Request and reply objects | `FastifyRequest`, `FastifyReply` | `Request`, `Response` from Express |

## 4. The federated schema

### Ownership

| Type | Owned by | Key | Extended by |
| --- | --- | --- | --- |
| `User`, `Wallet`, `LedgerEntry`, `AuthPayload`, `Balance` | `accounts` | `User.id`, `Wallet.userId` | `trading` (`User.orders`), `notifications` (`User.alerts`, `User.webhookUrl`) |
| `Market`, `Order`, `Trade`, `OrderBook`, `OrderBookLevel` | `trading` | `Market.symbol`, `Order.id`, `Trade.id` | — |
| `Alert`, `Delivery`, `Announcement` | `notifications` | `Alert.id`, `Delivery.id`, `Announcement.id` | — |

An entity reference crosses services in both directions. `Order.user` is a `User` reference that the gateway resolves in `accounts`. `User.orders` is a list that the gateway resolves in `trading`.

### Shape of the composed schema

Illustrative. Subgraphs each declare their own `type Query` and `type Mutation`; Federation 2 merges them.

```graphql
# accounts
type User @key(fields: "id") { id: ID! email: String! displayName: String! role: Role! wallets: [Wallet!]! createdAt: DateTime! }
type Wallet @key(fields: "userId") { userId: ID! balances: [Balance!]! }
type Balance { asset: Asset! available: Decimal! held: Decimal! }
type LedgerEntry { id: ID! kind: LedgerKind! asset: Asset! amount: Decimal! reference: String createdAt: DateTime! }
type AuthPayload { accessToken: String! refreshToken: String! user: User! }
enum Role { ADMIN USER }

# trading
type Market @key(fields: "symbol") { symbol: String! baseAsset: Asset! quoteAsset: Asset! referencePrice: Decimal! tickedAt: DateTime }
type Order @key(fields: "id") { id: ID! userId: ID! symbol: String! side: Side! type: OrderType! limitPrice: Decimal quantity: Decimal! filledQuantity: Decimal! status: OrderStatus! user: User! createdAt: DateTime! }
type Trade @key(fields: "id") { id: ID! symbol: String! price: Decimal! quantity: Decimal! executedAt: DateTime! }
type OrderBook { symbol: String! bids: [OrderBookLevel!]! asks: [OrderBookLevel!]! }
type OrderBookLevel { price: Decimal! quantity: Decimal! }
type User @key(fields: "id") { id: ID! orders(status: OrderStatus, limit: Int, offset: Int): [Order!]! }

# notifications
type Alert @key(fields: "id") { id: ID! userId: ID! symbol: String! direction: AlertDirection! threshold: Decimal! enabled: Boolean! createdAt: DateTime! lastTriggeredAt: DateTime }
type Delivery @key(fields: "id") { id: ID! alertId: ID! url: String! status: DeliveryStatus! attempts: Int! lastError: String createdAt: DateTime! deliveredAt: DateTime }
type Announcement @key(fields: "id") { id: ID! title: String! body: String! authorId: ID! createdAt: DateTime! sentAt: DateTime }
type User @key(fields: "id") { id: ID! alerts: [Alert!]! webhookUrl: String }
```

Queries and mutations:

| Service | Queries | Mutations |
| --- | --- | --- |
| `accounts` | `me`, `user(id)`, `users`, `wallet(userId)`, `ledger(userId, asset, limit, offset)` | `signIn`, `signOut`, `createUser`, `deposit`, `withdraw`, `updateProfile` |
| `trading` | `markets`, `market(symbol)`, `orderBook(symbol, depth)`, `trades(symbol, limit, offset)`, `orders(symbol, status, limit, offset)`, `order(id)` | `placeOrder`, `cancelOrder`, `tickPrices` |
| `notifications` | `alerts`, `deliveries(alertId)`, `announcements` | `createAlert`, `deleteAlert`, `setWebhookUrl`, `testWebhook`, `broadcastAnnouncement` |

### Who may call what

| Operations | Caller |
| --- | --- |
| `signIn`; `markets`, `market`, `orderBook`, `trades`; `announcements` | Anyone |
| Everything else that reads own data, places and cancels own orders, manages own alerts | A signed-in user |
| `users`, `user(id)`, `wallet(userId)` and `ledger(userId)` for another user, `createUser`, `deposit`, `tickPrices`, `broadcastAnnouncement` | The administrator |

## 5. REST endpoints on the gateway

| Method | Path | Caller | Purpose | Served by |
| --- | --- | --- | --- | --- |
| POST | `/graphql` | see above | The federated graph | subgraphs |
| GET | `/graphql` | anyone | GraphiQL | gateway |
| POST | `/api/v1/auth/sign-in` | anyone | Cookie sign-in | accounts |
| POST | `/api/v1/auth/sign-out` | user | Clear the cookie, revoke the refresh token | accounts |
| POST | `/api/v1/lab/reset` | anyone, by design | Load the fake data again on every service | all services |
| GET | `/api/v1/health` | anyone | Every service and its store | all services |
| GET | `/api/v1/reports/trades.csv` | user | Own trades as CSV | trading |
| GET | `/api/v1/reports/files/:name` | user | A report file | trading |
| GET | `/api/v1/reports/statements/:name` | user | A statement file | accounts |
| POST | `/api/v1/profile/avatar` | user | Fetch an avatar from a URL and store it | accounts |
| POST | `/api/v1/profile/documents` | user | Upload a document | accounts |
| POST | `/api/v1/webhooks/test` | user | Send a test delivery | notifications |
| POST | `/api/v1/admin/announcements` | administrator | Create and send an announcement | notifications |
| GET | `/docs`, `/docs/json` | anyone | OpenAPI document and UI | gateway |

The gateway's controllers do not contain logic. Each validates the caller, forwards the request to the service over the internal contract, and returns what the service answered.

Internal endpoints are listed in [service-communication.md](service-communication.md#5-internal-rest-contract).

## 6. Errors

### REST

The NestJS shape. A global `AllExceptionsFilter` produces it and logs the stack of an unexpected error instead of returning it.

```json
{ "statusCode": 403, "message": "Forbidden resource", "error": "Forbidden" }
```

### GraphQL

A `GraphQLError` with `extensions.code`. A stack is never in the response.

| `extensions.code` | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | No valid token |
| `FORBIDDEN` | A signed-in caller without the required role or ownership |
| `BAD_USER_INPUT` | Invalid arguments |
| `NOT_FOUND` | The object does not exist |
| `CONFLICT` | A valid request the state does not allow, such as withdrawing more than the available balance |
| `SERVICE_UNAVAILABLE` | Another service did not answer |

## 7. GraphQL and injection

GraphQL's type system refuses an object where a scalar is declared, so the classic `{"$ne": null}` payload cannot travel through a `String!` argument. A NoSQL or SQL injection in this lab therefore arrives by one of four doors, and the [scenario catalogue](../project/scenario-catalog.md#what-graphql-changes-about-injection) places scenarios at each: a REST endpoint, a JSON-typed scalar argument, a nested query-string parser, or string concatenation inside the resolver.

## 8. Developer conveniences

The gateway serves introspection, GraphiQL, the OpenAPI document and batched GraphQL requests, and applies no depth or complexity limit. For an application that runs locally for minutes, switching those off would only make it harder to use. They are deliberate, registered as scenarios in Phase 8, and marked in the options files then.
