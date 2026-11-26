# Data architecture

**Status:** revised on 2026-11-26. Versions were checked that day; the scaffolding pins the database engine versions.

## 1. One store per service

| Service | Engine | How it runs | Package | What is left after shutdown |
| --- | --- | --- | --- | --- |
| `accounts` | MongoDB | A real `mongod` child process on a loopback port, against a temporary data directory | `mongodb-memory-server` 11.4.0, driver `mongodb` 7.9.1 | Nothing. The process ends and the directory is deleted |
| `trading` | MySQL 8.4 | A real `mysqld` child process on a loopback port, against a temporary data directory | `mysql-memory-server` 1.18.0, driver `mysql2` 3.24.6 | Nothing. The process ends and the directory is deleted |
| `notifications` | SQLite | Inside the service process, through WebAssembly | `sql.js` 1.17.0 | Nothing. It was never on disk |

### What "in memory" means here

The requirement is that nothing survives. Each store meets it in a different way.

- **SQLite is in memory in the strict sense.** The whole database is a value in the service process.
- **MongoDB and MySQL are ephemeral.** A real database engine writes to a temporary directory, and the package that started it removes the directory when it stops.

The Project Owner chose the two packages by name, and their names say "memory", so one detail is worth recording. `mongodb-memory-server` used to start MongoDB with an in-memory storage engine, `ephemeralForTest`. MongoDB 7.0 removed that engine, so for any newer version the package falls back to the default engine and a temporary directory. The outcome is the same for the lab: nothing persists.

Both packages download their server binary on first use: `mongod` from MongoDB's download service (in [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs) the same package fetches MongoDB 8.2.6, about 80 MB) and `mysqld` from MySQL's CDN. The binaries are cached and reused, so the download happens once per machine. CI caches them too.

`mysql-memory-server` 1.18.0 can download MySQL 8.4 for macOS arm64 (8.0.26 and later) and Linux arm64 (8.0.31 and later).

## 2. Why the stores are ephemeral

The application is a sample that is started, preloaded with fake data, exercised, and shut down. It is not a running service and it holds nothing anyone needs. The stores follow from that.

| Reason | What it buys |
| --- | --- |
| **There is no data worth keeping.** Everything in every store is fake and was written by the seed | No migrations, no backups, no durability settings, no connection strings to protect |
| **The exploits are destructive.** A SQL injection may drop a table, a race may overdraw a wallet, an operator injection may change many documents at once | Every outcome is harmless and reversible. `POST /api/v1/lab/reset` or a restart restores the fake data |
| **A scanner must see the same target every time** | Every start loads identical data. Given the same requests, every run gives the same results, so an expected finding stays expected |
| **Nothing should have to be installed** | Each service starts its own engine. No database server to set up, no container, no broker |
| **The host should be as it was** | The engines are stopped and their directories removed when the lab stops |

An in-memory engine would have been simpler still, and for SQLite it is what the lab uses. MongoDB and MySQL have no free in-memory engine, so for those two the lab uses the real engine with a disposable directory. That has a side benefit: the NoSQL and SQL injection scenarios run against the genuine engines, with their genuine grammar and limits.

## 3. What to expect from the stores

| Expectation | Detail |
| --- | --- |
| They start themselves | Each backend service starts its engine when it boots. Nobody configures or starts a database |
| They are loaded on every start | The seed module of each service runs when the store is empty, which is every start |
| Reset restores the fake data | `POST /api/v1/lab/reset`, or restarting the lab |
| They are empty again after a stop | The engines are stopped from `onApplicationShutdown`. If the lab is killed instead of stopped, a temporary directory may remain under the system's temporary folder. It holds fake data only |
| Nothing is tuned | Default engine settings, small pools, no indexes beyond the ones the queries need |
| They may be damaged on purpose | Some scenarios corrupt data. That is expected, and reset undoes it |
| The first run is slower | The two binaries are downloaded once |

## 4. Data access

There are two ways into a store, one for each kind.

| Service | Store | Reached through |
| --- | --- | --- |
| `accounts` | MongoDB | The native `mongodb` driver 7.9.1. A document is a plain JSON object whose `_id` is the fixed identifier of its record. One repository class per collection |
| `trading` | MySQL | TypeORM 1.1.3 through `@nestjs/typeorm` 12.0.3 |
| `notifications` | SQLite | The same |

`accounts` has no object-relational mapping. The Project Owner decided that on 2026-11-26, before anything was built on TypeORM's MongoDB support: [ADR-011](decisions/ADR-011-native-mongodb-driver-for-accounts.md).

**The relational stores.**

| Setting | Value | Why |
| --- | --- | --- |
| `synchronize` | `true` | Every store is ephemeral, so the entities are the schema. There are no migrations and never will be |
| `entities` | Listed explicitly per service | Loading by glob breaks with the build output |
| `logging` | Off | Queries contain user data |

**The document store.** There is no schema to synchronize. The service creates its collections and their indexes when it starts, and creates them again on reset, because a scenario is allowed to drop one. What each collection holds, and which of its fields is unique, is in the [accounts specification](../project/services/accounts.md#2-data).

## 5. Money

Floating-point numbers are not used for money anywhere in the functional baseline.

| Concept | Rule |
| --- | --- |
| Unit | Integer minor units. Dollars in cents. Coins in hundred-millionths (1e-8), like satoshis |
| Storage | 64-bit integer. `BIGINT` in MySQL |
| Arithmetic | Integers only. A result that would need less than one minor unit is rounded half up, once, at the edge of the operation |
| API | A custom `Decimal` scalar that carries the value as a string (`"65000.00"`). Never `Float` or `Int` |

## 6. Entities

The entities of each service are defined in its [service specification](../project/services/README.md). This is the shape the design depends on. In `accounts` each one is a collection of documents; in `trading` and `notifications` each one is a table.

| Service | Entity | Holds |
| --- | --- | --- |
| `accounts` | `User` | `email`, `displayName`, `passwordHash`, `role`, `preferences`, `avatarUrl` |
| | `Session` | `userId`, `revokedAt`, `expiresAt` |
| | `Document` | `userId`, `storedName`, `originalName`, `mimeType`, `size` |
| `trading` | `Market` | `symbol`, `baseAsset`, `quoteAsset`, `referencePrice` |
| | `Wallet` | `userId`, `asset`, `balance`. One row per user and asset |
| | `LedgerEntry` | `userId`, `asset`, `amount` (signed), `kind`, `reference` |
| | `Order` | `userId`, `symbol`, `side`, `type`, `limitPrice`, `quantity`, `memo`, `status` |
| | `Trade` | `orderId`, `tickId`, `userId`, `symbol`, `side`, `price`, `quantity`, `fee` |
| | `PriceTick` | `symbol`, `previousPrice`, `newPrice` |
| | `Report` | `userId`, `kind`, `storedName` |
| `notifications` | `Alert` | `userId`, `symbol`, `direction`, `threshold`, `label`, `expression`, `enabled` |
| | `Delivery` | `alertId`, `userId`, `url`, `status`, `attempts`, `lastError`, `responseBody` |
| | `Announcement` | `title`, `body`, `authorId`, `sentAt` |
| | `UserSettings` | `userId`, `webhookUrl`, `email`, `sms`, `webhook` |

`userId` in `trading` and `notifications` refers to a user owned by `accounts`. There is no foreign key, because the rows live in different stores.

## 7. Transactions, and why none crosses a service

| Operation | Guarantee | How |
| --- | --- | --- |
| Placing an order | Atomic | One MySQL transaction: balances, order, trade, ledger |
| Withdrawal | Atomic and conditional | One `UPDATE … WHERE balance >= ?`, the affected rows checked |
| A price tick with fills | Atomic per tick | A transaction with row locks, and a unique key on (`orderId`, `tickId`) that refuses a second fill |
| A profile update | Atomic | One document update |
| Reset | Per service | Each service clears and reloads its own store |

Because no service calls another, no operation touches two stores, and there is no distributed transaction to get wrong. The first draft had a hold-then-settle sequence across two services, which could leave a hold behind if interrupted. Moving wallets into `trading` removed the sequence.

## 8. The fake data

Each service owns a seed module under `src/seed/`. Boot runs it when the store is empty; reset clears the store and runs it again.

**The fake users have fixed identifiers**, declared once in the shared library `libs/lab-data` and used by every seed module. A wallet in `trading` belongs to `u-alice`, and so does the user in `accounts`, without either service asking the other. The markets' starting prices live in the same library.

| Data | Values |
| --- | --- |
| Administrator | `admin@zazzles.exchange`, password `admin-lab-only`, role `ADMIN`, no wallet |
| Users | `alice`, `bob`, `carol`, `dave`, `erin` at `@zazzles.exchange`, passwords `<name>-lab-only`, role `USER` |
| Starting dollars | alice 10,000.00, bob 5,000.00, carol 2,500.00, dave 1,000.00, erin 500.00. Every coin balance 0 |
| Markets | BTC-USD 65,000.00, ETH-USD 3,200.00, SOL-USD 150.00, XRP-USD 0.50, DOGE-USD 0.12 |
| Open orders | Two resting limit orders per market, from different users |
| Trades | Three per market |
| Alerts | One per user, on different markets |
| Announcements | One |

The differing balances are deliberate: they make the effect of reading or changing *another* user's wallet visible.

## 9. Prices

The reference price of a market changes only on a price tick. A tick draws a small change per market from a seeded pseudo-random generator, so the same number of ticks always gives the same prices. The administrator triggers a tick with the `tickPrices` mutation in `trading`. Open limit orders whose price the tick crossed are filled. Alerts are evaluated afterwards by a separate call to `notifications`, which receives the new prices as its argument.

## 10. Reset

`POST /api/v1/lab/reset` on the gateway calls `POST /internal/lab/reset` on every service. Each service deletes its entities' data, runs its seed module, and answers `200`. The gateway answers with one status per service. Reset is not atomic across services; a service that fails to reset is reported by name, and the lab is restarted.
