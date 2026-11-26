# Design revision and the spike

Date-time: 2026-11-26T17-00-00Z (12:00:00, UTC-5).

Two things happened after the plan of 15:38 UTC was pushed. The Project Owner reviewed it and asked for changes, and a spike was run to answer a question the plan had left open. This note records both. The design itself is in the [service specifications](../services/README.md); this note says why it changed and what was measured.

## What the Project Owner asked for

1. Services should not call each other, for ease of testing and implementation, unless a few calls were worth keeping.
2. A specification for each service, with the designed vulnerabilities in it, and about two safe operations for every vulnerable one. One to one if two is harder.
3. All of the OWASP Top 10, and SQL injection, NoSQL injection, prototype pollution and stored cross-site scripting in particular.
4. Libraries with known CVEs, for the dependency audit. Already planned.
5. The services to be built by sub-agents, one per service, each tested on its own.

## What changed

| Before | After | Why |
| --- | --- | --- |
| `trading` called `accounts` to hold and settle funds, and called `notifications` after a price tick | A star. No service calls another ([ADR-010](../../architecture/decisions/ADR-010-services-never-call-each-other.md)) | Each service can be built and tested alone, and four sub-agents can work at once |
| Wallets, deposits and the ledger in `accounts` | In `trading` | An order is one transaction in one store |
| `trading` told `notifications` the new prices | The client calls `tickPrices`, then `evaluateAlerts(prices)` | The same |
| 72 scenarios in 19 families, with a `DEMO` family of 5 negative controls | 74 scenarios in 20 families, with `PROTO` and `XSS` added and `DEMO` removed | The protected counterparts are the negative controls; a separate family was redundant |
| A holdout batch and a stretch list | Neither, for now | The catalogue is sized to what the build order can carry |
| Eleven phases: three functional, a framework phase, three vulnerability batches, pins, release | Six steps: plan, scaffolding, the services in parallel, integration, pins, release | One sub-agent per service, each delivering its service complete |
| One protected counterpart per scenario, where meaningful | One or two. 118 safe operations for 62 vulnerable ones | Request 2 |
| Sessions with rotating refresh tokens | A session record with an id in the token; sign-out revokes it | Simpler, and still enough for AUTH-004 |
| Limits orders matched against each other, by price and time | A limit order is filled by a tick that crosses its price | No matching engine |
| The repository's own specification template | The `spec-builder` skill, vendored from zazz-skills | Requested |

**No weakness was lost by removing the calls between services.** Each one that seemed to need a call lives at the boundary between the gateway and a service: an internal endpoint that trusts an identity header, backend ports reachable on loopback, request forgery into a backend port.

## The ratio

| Service | Vulnerable operations | Safe operations | Safe per vulnerable |
| --- | --- | --- | --- |
| accounts | 28 | 41 | 1.5 |
| trading | 17 | 35 | 2.1 |
| notifications | 9 | 29 | 3.2 |
| gateway | 8 | 13 | 1.6 |

The target was about two safe for every vulnerable one. The lab reaches 1.9 overall. `accounts` has the most scenarios that share an operation, which lowers its count; the gateway has five settings that a process cannot have twice.

## A mistake worth a rule

The first drafts of the service specifications reused three IDs: `ACCESS-001`, `ACCESS-003` and `ACCESS-004` each appeared in the `accounts` and the `trading` specification with different meanings. It was found by counting the IDs in the four files with a script, not by reading. **Rule: a scenario ID is unique across the whole repository.** Count them with a script whenever a specification changes.

## The spike

**The question.** The Project Owner asked whether GraphQL works on Fastify, or whether the API would have to be Express and Apollo with Fastify only for the services. The plan said it works, from the documentation and the packages' peer ranges, and flagged it as not verified.

**What was run.** A throwaway project in a temporary directory, since removed. NestJS 12.6.3; a gateway on `FastifyAdapter`; a `users` subgraph on `FastifyAdapter({ http2: true })`; an `orders` subgraph on the Express adapter; Apollo Server 5.5.2, gateway 2.14.5, `graphql` 16.15.0; TypeScript 6.0.3; pnpm 12.23.0. Schema-first definitions. A `fetch`-shaped function over `node:http2`, supplied through `buildService`.

**The result.** It works.

- The gateway composed both subgraphs and answered `{ getUser(id: "1") { id name orders { id total user { name } } } }` and `{ getOrders { id userId total user { name } } }` with data joined across the two services.
- The Fastify subgraph logged `HTTP/2.0` for all five requests it received: one for schema discovery, four for queries.
- The Express subgraph logged `HTTP/1.1` for its four.
- The client's own requests reached the gateway as `HTTP/1.1`.
- After compiling with no type errors, nothing was left listening when the run ended.

**What it settles.** Risks T1, T3 and T6 of the architecture are closed: the gateway on Fastify with an HTTP/2 data source; HTTP/2 on the Fastify adapter with Apollo mounted; an Apollo subgraph on the Express adapter.

## What the spike taught that the scaffolding needs

| Fact | Consequence |
| --- | --- |
| pnpm 12 stopped the install: `ERR_PNPM_IGNORED_BUILDS` for `@apollo/protobufjs` 1.2.8 and `protobufjs` 7.6.6, which come in through `@apollo/gateway` | `pnpm-workspace.yaml` needs `allowBuilds` with both set to `false`. They only build a browser bundle |
| pnpm 12 wrote `minimumReleaseAgeExclude` for the six NestJS 12.6.3 packages on its own | pnpm holds back packages younger than its minimum release age, and records exact pins that are exempt. Expected once; leave it |
| `IntrospectAndCompose` has no `fetcher` per subgraph. `subgraphs` is `ServiceEndpointDefinition[]` | Schema discovery goes through the data source from `buildService`. Decide the transport there, once |
| `Fetcher`, the gateway's type, is narrower than the global `fetch`. TypeScript rejected `fetch` with two errors | Cast once, in `libs/http2` |
| Composition failed until `@provides(fields: "id")` was on the field that returns an entity reference: "field User.id is not resolvable because marked @external" | `Order.user` carries `@provides`. The scaffolding's example does too |
| A validation error came back with `extensions.stacktrace`, the whole server stack | Apollo includes it unless `NODE_ENV` is `production`. GQL-004 is true from the first line of gateway code |
| NestJS's Express adapter creates an `http` or an `https` server (source: `initHttpServer`) | The Express service speaks HTTP/1.1 |

## Not covered by the spike

- The code-first schema generator with TypeScript 6. The spike used schema-first definitions.
- TypeORM 1.1.3 against MongoDB.
- `mysql-memory-server`: start time, and the size of the download.
- Whether any vulnerable pin installs under pnpm 12.

The scaffolding takes the first three, in that order. Step 4 takes the last.

## What this note supersedes

The last section of the [stack findings](2026-11-26T15-38-03Z_stack-findings.md), written at 15:38 UTC: its first three "not verified" items are now verified. The rest of that note still holds.
