# API design

**Status:** revised on 2026-11-26. The API of each service is now defined in its [service specification](../project/services/README.md). This document holds what they share.

## 1. Where the API is defined

| Service | Operations defined in |
| --- | --- |
| `accounts` | [services/accounts.md](../project/services/accounts.md#4-api): 21 safe and 15 vulnerable GraphQL operations, 20 safe and 12 vulnerable REST endpoints |
| `trading` | [services/trading.md](../project/services/trading.md#4-api): 26 safe and 14 vulnerable GraphQL operations, 9 safe and 3 vulnerable REST endpoints |
| `notifications` | [services/notifications.md](../project/services/notifications.md#4-api): 20 safe and 6 vulnerable GraphQL operations, 9 safe and 3 vulnerable REST endpoints |
| `gateway` | [services/gateway.md](../project/services/gateway.md#4-api): 13 safe and 7 vulnerable endpoints of its own, and the pass-through |

In all: 74 deliberate weaknesses on 62 vulnerable operations, and 118 safe operations. About 1.9 safe for every vulnerable one. The gateway holds the difference: five of its weaknesses are settings a process cannot have twice.

## 2. Surface map

| Surface | Address | Who calls it | Built with |
| --- | --- | --- | --- |
| Federated GraphQL | `POST /graphql` and `GET /graphql` on the gateway | Any client | Apollo gateway on the Fastify adapter |
| REST | `/api/v1/*` and `/docs` on the gateway | Any client | Fastify controllers, OpenAPI through `@nestjs/swagger` |
| Subgraph | `POST /graphql` on each service's port | The gateway. On loopback, anyone else | `ApolloFederationDriver`. Fastify for `accounts` and `trading`, Express for `notifications` |
| Internal REST | `/internal/*` on each service's port | The gateway | Fastify controllers, or Express controllers in `notifications` |

## 3. Conventions

| Concern | Rule |
| --- | --- |
| Names | GraphQL types in `PascalCase`, fields and arguments in `camelCase`. Mutations are verbs: `placeOrder`, `cancelOrder` |
| Identifiers | The GraphQL `ID` scalar, always a string. A client never sees a number |
| Money | The `Decimal` scalar: a string such as `"65000.00"`. Never `Float`, except where a scenario is about floats |
| Time | The `DateTime` scalar: an ISO 8601 string in UTC |
| JSON | A `JSON` scalar, parsed with `JSON.parse`. It is the only way an object reaches a resolver untyped, and the scenarios that need one say so |
| Input | `@InputType()` classes and DTOs with class-validator, through a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` |
| Errors | `extensions.code` in GraphQL; the NestJS error shape in REST. See [Errors](#5-errors) |
| Pagination | `limit` and `offset`. The default `limit` is 50 and the baseline caps it at 200 |
| Versioning | REST is versioned by path (`/api/v1`). The graph is not versioned; the lab lives for minutes |
| Names in code | Neutral. The classification of an operation as safe or vulnerable lives in the specifications and the catalogue |

## 4. Adapter idioms

The same job looks different on the two adapters. That is part of what the lab shows.

| Job | Fastify: `gateway`, `accounts`, `trading` | Express: `notifications` |
| --- | --- | --- |
| JSON body | Fastify's built-in parser. A route can add a JSON schema through `@RouteConfig()` | `express.json()` as middleware |
| Cookies | `@fastify/cookie`, `reply.setCookie()` | `res.cookie()`, `cookie-parser` |
| File upload | `@fastify/multipart` | not used |
| Sending a file | `reply.send(stream)`; `@fastify/static` for a directory | `res.sendFile()`, `res.download()` |
| HTML | a template through `@fastify/view` | `res.render()` with `ejs` |
| Route scoping | an encapsulated plugin with a prefix, with its own hooks | `express.Router()` mounted with middleware |
| Request and reply objects | `FastifyRequest`, `FastifyReply` | `Request`, `Response` from Express |

## 5. Errors

### REST

The NestJS shape. A global `AllExceptionsFilter` produces it and logs the stack of an unexpected error instead of returning it.

```json
{ "statusCode": 403, "message": "Forbidden resource", "error": "Forbidden" }
```

### GraphQL

A `GraphQLError` with `extensions.code`. A stack is never in the response, except where a scenario puts it there.

| `extensions.code` | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | No valid token |
| `FORBIDDEN` | A signed-in caller without the required role or ownership |
| `BAD_USER_INPUT` | Invalid arguments |
| `NOT_FOUND` | The object does not exist |
| `CONFLICT` | A valid request the state does not allow, such as withdrawing more than the available balance |
| `SERVICE_UNAVAILABLE` | A service did not answer |

## 6. The federated schema

### The one shared entity

| Type | Owned by | Key | Extended by |
| --- | --- | --- | --- |
| `User` | `accounts` | `User.id` | `trading` adds `wallets`, `orders`, `trades`, `ledger`. `notifications` adds `alerts`, `deliveries`, `webhookUrl`, `notificationSettings` |
| `Order`, `Trade`, `Market`, `Wallet`, `LedgerEntry` | `trading` | `id`, `id`, `symbol`, `id`, `id` | — |
| `Alert`, `Delivery`, `Announcement` | `notifications` | `id` | — |

`Order.user` returns a `User` reference that the gateway resolves in `accounts`. It carries `@provides(fields: "id")`. `User.orders` is a list the gateway resolves in `trading`. Neither service calls the other.

### Who may call what

| Operations | Caller |
| --- | --- |
| `signIn`, `signUp`; the market, order book and trade queries; `announcements` | Anyone |
| Operations on the caller's own data, orders and alerts | A signed-in user |
| Operations on other users' data, deposits, price ticks, alert evaluation, announcements sent | The administrator |

## 7. GraphQL and injection

GraphQL's type system refuses an object where a scalar is declared, so the classic `{"$ne": null}` payload cannot travel through a `String!` argument. A NoSQL or SQL injection in this lab therefore arrives by one of these doors, and the [service specifications](../project/services/README.md) place scenarios at each:

| Door | Example | Scenarios |
| --- | --- | --- |
| A REST endpoint proxied to a service | `POST /api/v1/auth/login` with a JSON body | MONGO-001 |
| A `JSON` scalar argument | `findUsers(filter: JSON)` | MONGO-002, MONGO-005, MONGO-006 |
| A nested query-string parser | `?filter[role]=ADMIN` | MONGO-003 |
| String concatenation into SQL inside the resolver | `orderLookup(id: "1 OR 1=1")` | SQL-001 to 004 |
| A dotted path, walked | `setPreferenceByPath(path: "__proto__.role")` | PROTO-001 |
| JSON inside a string, parsed by the application | `updateNotificationSettings(settings: "{\"__proto__\":…}")` | PROTO-002 |

The last door exists because the parsers defend themselves. Fastify's JSON parser rejects a body with a `__proto__` key, and GraphQL's variables arrive through that parser. A string that the application parses itself does not.

## 8. Developer conveniences

The gateway serves introspection, GraphiQL, the OpenAPI document and batched GraphQL requests, sets no depth limit, and returns stack traces in errors. For an application that runs locally for minutes, switching those off would only make it harder to use. They are scenarios GQL-001 to 004 and CONFIG-003, with the hardened value recorded for each.
