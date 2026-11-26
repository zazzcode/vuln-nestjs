# ADR-005 — Three backend services, each the only user of its store

**Status:** Proposed in Phase 0, waiting for review
**Date:** 2026-11-26

## Context

The constraint is one gateway and no more than three backend services, with MongoDB in one and MySQL in another. The exchange has to be functional enough that its weaknesses sit in plausible features, and it has to stay small.

## Decision

| Service | Owns | Store |
| --- | --- | --- |
| `accounts` | Users, sessions, wallets, the ledger, profile documents | MongoDB |
| `trading` | Markets, orders, the order book, trades, price ticks, reports | MySQL |
| `notifications` | Alerts, webhook deliveries, announcements | SQLite in memory |

No store is shared. `trading` never stores a balance; it asks `accounts` for a hold or a settle.

## Options considered

| Option | Why not |
| --- | --- |
| Two services: fold `notifications` into `trading` | Meets the constraint, and is the fallback. But request forgery, template injection and command injection would have no natural home, and there would be no second entity extension of `User` |
| Four or more | More than the constraint allows, and more to review for no scanner value |
| One shared relational database | Couples the services, and removes the reason for the calls between them, where several scenarios live |
| MongoDB twice, or MySQL twice | The constraint asks for one of each. SQLite in memory for the third is the cheapest third TypeORM driver |

## Consequences

- There is no transaction across services. A step interrupted between `trading` and `accounts` is undone by a reset. Accepted, because the application is ephemeral (ADR-004).
- Reset is a fan-out: each service resets its own store.
- `Order.userId` refers to a user in another store. There is no foreign key.
- Open question Q2 in the [project plan](../../project/project-plan.md#10-open-questions) keeps the two-service fallback visible.
