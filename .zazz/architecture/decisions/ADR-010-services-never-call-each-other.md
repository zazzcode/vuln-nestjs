# ADR-010 — Services never call each other

**Status:** Accepted by the Project Owner on 2026-11-26
**Date:** 2026-11-26

## Context

The first design had two calls between services. `trading` asked `accounts` to hold and settle funds for an order, and told `notifications` to evaluate alerts after a price tick.

The Project Owner prefers services that do not call each other, for ease of testing and implementation, and asked whether one or two calls should stay. The application is a sample: complexity is worth adding only when a scanner benefits from it.

## Decision

A star. The gateway talks to every service. No service has a client for another service.

Two changes paid for it:

| Before | After |
| --- | --- |
| Wallets, deposits and the ledger in `accounts`. `trading` called `accounts` to hold and settle | Wallets, deposits and the ledger in `trading`. Placing an order is one transaction in one store |
| `trading` called `notifications` after a tick | The client calls `tickPrices` on `trading`, then `evaluateAlerts(prices)` on `notifications` |

## Why no call was kept

- **Each service is built and tested alone.** A test starts one service with its own store and calls it directly. Four sub-agents can build four services at the same time without touching each other's code.
- **It is federation's own model.** Apollo's design is that services never call each other at query time; the gateway joins their data.
- **No weakness is lost.** Every scenario that seemed to need a call between services lives just as well at the boundary between the gateway and a service:

| Weakness | Where it lives now |
| --- | --- |
| An internal endpoint that trusts an identity header (ACCESS-005) | `GET /internal/me` on `accounts`, which any local caller can reach |
| Backend endpoints reachable without the gateway (GQL-007) | The services' `/graphql` and `/internal/*` ports |
| Request forgery into a backend port (SSRF-001, SSRF-002, SSRF-003) | A webhook, avatar or import URL that points at `127.0.0.1:310x` |
| A race across two steps (LOGIC-002, LOGIC-005) | Inside `trading`, on one store, where a test can fire both requests |

## Options considered

| Option | Why not |
| --- | --- |
| Keep both calls | Two services cannot be tested alone, and two sub-agents cannot build in parallel without agreeing on a contract first |
| Keep one call, for coverage | The code patterns a scanner looks for at a service-to-service call — an HTTP client, a forwarded identity, a trusted internal endpoint — are all present at the gateway-to-service calls |
| Have the gateway orchestrate the order flow | The Apollo gateway routes fields; it hosts no resolvers. Orchestrating there would mean a second GraphQL schema at the gateway, which is more complexity, not less |

## Consequences

- `accounts` owns identity and profile; `trading` owns money. A deposit is an operation on `trading`.
- The fake users have fixed identifiers in a shared library, so that every seed module can refer to the same users without a call.
- Alert delivery needs two calls from the client. The Postman collection and the tests make both.
- There is no transaction across stores, because no operation touches two stores.
- A lint rule forbids a service from importing the HTTP client library for another service.
