# Architecture

How Zazzles Exchange is put together, and why. The design records with their options and consequences are in [`.zazz/architecture/`](../.zazz/architecture/README.md); this page is the summary for readers of the lab.

## It is a sample that is started, seeded and stopped

The application is not a running service. It is started, preloaded with fake data, exercised by a test, a scanner or a person, and shut down.

| Step | What happens |
| --- | --- |
| Start | One command starts the three backend services. Each starts its own database, loads fake data, and listens on loopback. Then the gateway starts and composes the GraphQL schema |
| Exercise | Requests go to the gateway. `POST /api/v1/lab/reset` loads the fake data again at any time |
| Stop | All four processes stop, the databases stop, and their data is gone |

Most of the design follows from that:

- **Nothing persists.** The databases are in memory or temporary. There are no migrations and no backups.
- **Anything may be broken.** The exploits are destructive by nature. A reset undoes what they did.
- **Every run is the same.** Identical fake data at every start, so an expected finding stays expected.
- **Nothing to install.** The services start their own database engines. Two binaries are downloaded once and cached.
- **No operational plumbing.** No retries, reconciliation, caches, message brokers, metrics or tracing. They matter only for an application that stays up.

What it still does: bind to loopback only, stop cleanly, and write its functional baseline safely, because every protected counterpart has to be a real pattern.

## Services

| Service | Adapter | Owns | Store | Listener |
| --- | --- | --- | --- | --- |
| `gateway` | Fastify | The federated GraphQL schema, REST pass-through. The only public listener | none | `127.0.0.1:3000`, HTTP/1.1 |
| `accounts` | Fastify | Users, sessions, wallets, deposits, withdrawals, the ledger | MongoDB, in memory | `127.0.0.1:3101`, HTTP/2 |
| `trading` | Fastify | Markets, orders, the order book, trades, price ticks | MySQL, in memory | `127.0.0.1:3102`, HTTP/2 |
| `notifications` | Express | Price alerts, webhook deliveries, announcements | SQLite, in memory | `127.0.0.1:3103`, HTTP/1.1 |

Three processes use the Fastify adapter and one uses the Express adapter, so that a scanner is tested against both. Each service is the only user of its store. `trading` never stores a balance: it asks `accounts` to hold and to settle funds.

## How they talk

| Path | Protocol | Carries |
| --- | --- | --- |
| Client → gateway | HTTP/1.1 | `POST /graphql`, REST under `/api/v1`, the OpenAPI document at `/docs` |
| Gateway → `accounts`, `trading` | HTTP/2 | Subgraph fetches and internal REST calls |
| Gateway → `notifications` | HTTP/1.1 | The same, to the Express service |
| `trading` → `accounts` | HTTP/2 | Wallet hold and settle |
| `trading` → `notifications` | HTTP/1.1 | Evaluate alerts after a price tick |
| `notifications` → webhook | HTTP/1.1 | Signed deliveries, to a URL the caller chose |

- **The graph.** Each backend service is an Apollo Federation 2 subgraph, written code first. The gateway composes them at start. `User.orders` is served by `trading` for a user owned by `accounts`; `User.alerts` by `notifications`.
- **The edge speaks HTTP/1.1** because curl, Postman, Newman and Burp negotiate HTTP/2 only over TLS, and the lab has no TLS.
- **The Express service speaks HTTP/1.1** because NestJS's Express adapter has no HTTP/2.
- **Identity is verified at every hop.** The gateway forwards the token; each service verifies it itself.

## The important flows

1. **A federated query.** `me { orders { user { displayName } } }` is planned by the gateway and answered by `accounts` and `trading` together, with an entity hop between them.
2. **Placing an order.** `trading` asks `accounts` to hold the funds, persists and matches the order, then asks `accounts` to settle.
3. **A price tick.** `trading` sets new reference prices, matches resting limit orders, and asks `notifications` to evaluate alerts. A crossed alert is delivered to a webhook.
4. **Reset.** The gateway calls every service; each clears its store and loads the fake data again.

## Deliberate weaknesses in the design itself

Two properties of the lab's default configuration are weaknesses on purpose, because a local sample has no reason to avoid them:

- The gateway serves introspection, GraphiQL, the OpenAPI document and batched GraphQL requests, and applies no depth limit (scenarios GQL-001 to 003, CONFIG-003).
- The backend services listen on loopback ports, so a local caller can skip the gateway and call a subgraph's federation endpoints directly (GQL-007).

## Further reading

- [`.zazz/architecture/project.md`](../.zazz/architecture/project.md) — the full design, with diagrams
- [`.zazz/architecture/data-architecture.md`](../.zazz/architecture/data-architecture.md) — why the stores are ephemeral, the entities, the fake data
- [`.zazz/architecture/decisions/`](../.zazz/architecture/decisions/README.md) — each decision with the options that were rejected
- [`vulnerabilities/index.md`](vulnerabilities/index.md) — what the lab will contain
