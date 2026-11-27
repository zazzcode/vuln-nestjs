# Service specifications

The contract for each service: what it owns, its data, its API, and every deliberate weakness with its protected counterparts. These are the specifications the services are built and tested against, one per service, so that each can be built and tested on its own.

| Specification | Service | Adapter | Store |
| --- | --- | --- | --- |
| [accounts.md](accounts.md) | `accounts`: users, sign-in, sessions, profile, documents | Fastify, HTTP/2 | MongoDB |
| [trading.md](trading.md) | `trading`: markets, prices, wallets, orders, trades, reports | Fastify, HTTP/2 | MySQL |
| [notifications.md](notifications.md) | `notifications`: alerts, webhook deliveries, announcements | Express, HTTP/1.1 | SQLite in memory |
| [gateway.md](gateway.md) | `gateway`: the federated graph, REST pass-through, its own REST endpoints | Fastify, HTTP/1.1 | none |

## The shape every service follows

- **A star.** The gateway talks to every service. **Services never call each other.** A flow that needs two services is two calls made by the client.
- **Two doors per service.** `POST /graphql` is its subgraph, which only the gateway needs. `/internal/*` is REST, which the gateway calls on behalf of a client.
- **One shared entity.** `User` is owned by `accounts` and keyed by `id`. `trading` and `notifications` add fields to it. Nothing else crosses services.
- **Built and tested alone.** A service's own tests start that service, with its own store, and call its `/graphql` and `/internal/*` directly. No other service is needed.

## Shared conventions

| Concern | Rule |
| --- | --- |
| Identifiers | The GraphQL `ID` scalar, always a string |
| Scalars | `Decimal` (a string such as `"65000.00"`), `DateTime` (an ISO 8601 string in UTC), `JSON` (any JSON value; parsed with `JSON.parse`) |
| Money | Integer minor units. Dollars in cents, coins in hundred-millionths |
| Tokens | HS256 JWT. Claims `sub` (user id), `sid` (session id), `role`. Sent as `Authorization: Bearer …` or in the `vcx_session` cookie |
| Authentication | Every service verifies the token itself, through the shared library `libs/internal-auth`. A global guard; `@Public()` marks an open operation |
| Authorization | `@Roles('ADMIN')` with a roles guard for administration. An ownership check inside the service for anything selected by `id` or `userId` |
| Input | `@InputType()` classes and DTOs with class-validator, through a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` |
| Errors | GraphQL: `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`). REST: the NestJS shape. Never a stack |
| Pagination | `limit` defaults to 50 and is capped at 200 |
| Internal REST | Called with the caller's token, or with `x-internal-token` when the call is the system's |

## Safe and vulnerable operations

Every operation in a specification is one of two kinds.

- **Safe.** Part of the functional baseline, or a protected counterpart.
- **Vulnerable.** A deliberate weakness, registered in the [catalogue](../scenario-catalog.md) with an ID.

Rules that hold in every service:

1. **A vulnerable operation has at least one protected counterpart.** The counterpart receives the identical payload and stays inert. Where a second, different technique exists, there is a second counterpart.
2. **About two safe operations for every vulnerable one.** The exact count is stated in each specification. The one exception is the gateway's process-wide configuration, which cannot have a twin.
3. **Names in code are neutral.** The tables here are the answer key. No identifier or path says "vuln", "unsafe" or "safe".
4. **The vulnerable line carries a marker**: `// SQL-003 / CWE-89: …`.
5. **A vulnerability is never fixed.** A test that shows one stopped working is a regression.

## How to read a scenario row

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| `SQL-001` | what is wrong, and where | the operation that carries it | the identical payload, inert, by technique A | by technique B |

Every operation named in a row is defined in that service's API section. "Config" in the Vulnerable column means the weakness is a process-wide setting: it has no twin and is documented with its hardened value instead.
