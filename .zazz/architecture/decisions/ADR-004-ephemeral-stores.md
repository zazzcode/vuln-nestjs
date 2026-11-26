# ADR-004 — Ephemeral stores, because the application is started, seeded and stopped

**Status:** Proposed in Phase 0, waiting for review
**Date:** 2026-11-26

## Context

The Project Owner set the operating model: this is a **sample application**. It is run, preloaded with fake data, and shut down. It is not intended to stay up or to be a real application. That is why the databases were specified as in memory: the whole application can be ephemeral.

This record states that model where the architecture can refer to it, and lists what it removes.

## Decision

Nothing in the lab persists.

| Rule | Consequence |
| --- | --- |
| Each backend service owns one store and is its only user | No shared database, no cross-service join |
| The service starts its own store at boot and stops it at shutdown | Nothing to install, configure or clean up |
| Fake data is loaded at every start, from a seed module in each service | Every run, test and scan starts from the same state |
| `POST /api/v1/lab/reset` loads the fake data again | Any exploit outcome is undone with one request |
| No migrations, no durability settings, no backups | `synchronize: true`. The entities are the schema |

| Service | Store | How it is ephemeral |
| --- | --- | --- |
| `accounts` | MongoDB | `mongodb-memory-server` starts a real `mongod` against a temporary directory and removes it on stop |
| `trading` | MySQL 8.4 | `mysql-memory-server` starts a real `mysqld` against a temporary directory and removes it on stop |
| `notifications` | SQLite | `sql.js` holds the database in the process's memory |

## Why ephemeral is the right choice here

1. **There is no data worth keeping.** Everything is fake and was written by the seed.
2. **The exploits are destructive.** A SQL injection may drop a table. A race may overdraw a wallet. With disposable stores, every outcome is harmless and reversible.
3. **A scanner must see the same target every time.** Identical data at every start keeps an expected finding expected.
4. **Nothing has to be installed.** No database server, no container, no broker.
5. **The host is left as it was.** The engines are stopped and their directories removed.

## Expectations

What anyone running the lab should expect from the stores.

- They start by themselves and are already loaded with fake data when the gateway answers.
- The first run on a machine is slower: the `mongod` and `mysqld` binaries are downloaded once and cached.
- Reset and restart mean the same thing to the data.
- After a stop, no database process and no temporary directory remain. If the lab is killed instead of stopped, a temporary directory may remain under the system's temporary folder. It holds fake data only.
- The data may be corrupted by design. That is what the scenarios do.

## Options considered

| Option | Why not |
| --- | --- |
| Installed or containerized databases | Something to install, configure and clean up. A connection string to protect. Contradicts the operating model |
| Plain objects in memory, with no engine | The injection scenarios would run against a fake. They are worth more against the real grammar and limits of MongoDB and MySQL |
| An in-memory engine for all three | MongoDB and MySQL have no free in-memory engine. SQLite does, and the lab uses it there |

## What the operating model removes from the architecture

These were considered for the plan and are not built, because each matters only for an application that stays up: retries, idempotency keys on internal calls, reconciliation of cross-service steps, request tracing across services, token-family revocation, reconciliation jobs, rolling upgrades, horizontal scale. If a service is down or a step was interrupted, the answer is to restart the lab.

What stays, because the application being ephemeral does not excuse it: loopback-only listeners, a clean stop, and a functional baseline written safely, because the protected counterparts have to be real.

## Consequences

- The functional tests assert the stop: after the lab is stopped, no `mongod` or `mysqld` process and no temporary directory remain.
- Scenarios may corrupt data freely.
- No phase adds persistence. A proposal to add it contradicts this record and needs a new one.

## Verified facts

Checked on 2026-11-26.

- `mongodb-memory-server-core` 11.4.0 starts MongoDB with the `wiredTiger` engine and a temporary directory when the MongoDB version is 7.0 or later. The `ephemeralForTest` in-memory engine was removed in MongoDB 7.0. So "in memory", for MongoDB and MySQL, means ephemeral in practice. See [data-architecture.md](../data-architecture.md#1-one-store-per-service).
- `mysql-memory-server` 1.18.0 can download MySQL 8.4 for macOS arm64 and for Linux arm64 and x64.
