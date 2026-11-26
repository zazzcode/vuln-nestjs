# ADR-011 — The `accounts` service uses the native MongoDB driver, not TypeORM

**Status:** Decided by the Project Owner on 2026-11-26
**Date:** 2026-11-26

## Context

The plan put all three backend services on TypeORM 1.1.3, so that the lab would have one way of reaching a store. TypeORM describes its own support for MongoDB as basic, so the plan carried it as a risk (R1 in the project plan, T2 in the architecture): the scaffolding would prove TypeORM against MongoDB with one real entity before anything was built on it, and fall back to the native `mongodb` driver behind the same repositories if it fell short.

The proof had not started when the Project Owner removed the question. Their instruction, on 2026-11-26: do not use TypeORM with MongoDB; use the native driver; update the specifications and the plans.

## Decision

`accounts` reaches MongoDB through the native `mongodb` driver, with documents as plain JSON.

- A document is a plain object. Its `_id` is the fixed identifier of its record, declared once in `libs/lab-data`.
- Each collection has one repository class, and nothing else in the service touches the driver.
- `typeorm` and `@nestjs/typeorm` are not dependencies of `apps/accounts`.
- `trading` on MySQL and `notifications` on SQLite stay on TypeORM 1.1.3 through `@nestjs/typeorm` 12.0.3.

## Options considered

| Option | Why not |
| --- | --- |
| TypeORM's MongoDB support, as first planned | The plan's own fallback was the native driver behind the same repositories, so a proof that failed would have cost a rewrite of the service's data access in the middle of its build. The Project Owner chose the fallback directly. TypeORM's MongoDB layer also puts its own mapping between a filter and the store, and six scenarios of the accounts specification (`MONGO-001` to `MONGO-006`) are about exactly what a filter, a sort, a projection or an update document contains when it arrives there |
| Mongoose | A second mapping layer with casting and validation of its own, another dependency with its own advisory history, and the same distance from the driver's operators |
| No TypeORM anywhere | The SQL injection scenarios of `trading` (`SQL-001` to `SQL-004`) sit in TypeORM's own query builder and `DataSource.query()`. The scanner coverage the Project Owner asked for needs them there |

## Consequences

- The lab has two ways of reaching a store: a native driver for the document store, an object-relational mapper for the relational stores. A reader has two styles to learn, as in most NestJS systems that use both kinds.
- Nothing has to be proven about TypeORM and MongoDB. The scaffolding proves the native driver instead: one collection, a fixed string `_id`, indexes created at start. Risks R1 and T2 are closed by this decision.
- `accounts` has no schema to synchronize. Its service creates its collections and indexes when it starts, and again on reset, because a scenario is allowed to drop one.
- `mongodb` 7.9.1 is a dependency of `apps/accounts` only. It is an optional peer of `typeorm`, so `trading` and `notifications` do not receive it.
- A NoSQL operator injection reads as what it is: a filter document passed to `collection.find()`.

## Verified facts

Checked on 2026-11-26 against the npm registry.

- `mongodb` 7.9.1 is the latest release of the driver (2026-11-19). `mongodb-memory-server` 11.4.0 is the latest (2026-11-21).
- `typeorm` 1.1.3 declares `mongodb` as `^7.0.0`, and as an optional peer.
