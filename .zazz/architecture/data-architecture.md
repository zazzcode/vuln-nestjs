# Data architecture

**Status:** proposed in Phase 0. Versions were checked on 2026-11-26; Phase 1 pins the database engine versions.

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

The Project Owner chose the two packages by name, and their names say "memory", so one detail is worth recording. `mongodb-memory-server` used to start MongoDB with an in-memory storage engine, `ephemeralForTest`. MongoDB 7.0 removed that engine, so for any newer version the package falls back to the default engine and a temporary directory (checked in the source of `mongodb-memory-server-core` 11.4.0). The outcome is the same for the lab: nothing persists.

Both packages download their server binary on first use: `mongod` from MongoDB's download service (in [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs) the same package fetches MongoDB 8.2.6, about 80 MB) and `mysqld` from MySQL's CDN. The binaries are cached and reused, so the download happens once per machine. CI caches them too.

`mysql-memory-server` 1.18.0 can download MySQL 8.4 for macOS arm64 (8.0.26 and later) and Linux arm64 (8.0.31 and later), so it works on the Project Owner's machine and on GitHub's arm64 and x64 runners.

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
| They are seeded on every start | The seed module of each service runs when the store is empty, which is every start |
| Reset restores the fake data | `POST /api/v1/lab/reset`, or restarting the lab |
| They are empty again after a stop | The engines are stopped from `onApplicationShutdown`. If the lab is killed instead of stopped, a temporary directory may remain under the system's temporary folder. It holds fake data only |
| Nothing is tuned | Default engine settings, small pool, no indexes beyond the ones the queries need |
| They may be damaged on purpose | Some scenarios corrupt data. That is expected, and reset undoes it |
| The first run is slower | The two binaries are downloaded once |

## 4. Object-relational mapping

All three services use TypeORM 1.1.3 through `@nestjs/typeorm` 12.0.3.

| Setting | Value | Why |
| --- | --- | --- |
| `synchronize` | `true` | Every store is ephemeral, so the entities are the schema. There are no migrations and never will be |
| `entities` | Listed explicitly per service | Loading by glob breaks with the build output |
| `logging` | Off | Queries contain user data |

**Risk T2.** TypeORM's documentation describes its MongoDB support as basic, and notes that most of TypeORM is specific to relational databases. The `accounts` service is written against the repository API and stays within operations TypeORM documents for MongoDB (`find`, `findOne`, `findOneAndUpdate`, `aggregate` with a typed pipeline). Where an operation is missing, the service reaches the native collection through the TypeORM manager. Phase 1 proves this with one real entity before Phase 2 builds on it.

## 5. Money

Floating-point numbers are not used for money anywhere in the functional baseline.

| Concept | Rule |
| --- | --- |
| Unit | Integer minor units. Dollars in cents. Coins in hundred-millionths (1e-8), like satoshis |
| Storage | 64-bit integer. `BIGINT` in MySQL, `Long` in MongoDB |
| Arithmetic | Integers only. A result that would need less than one minor unit is rounded half up, once, at the edge of the operation |
| API | A custom `Decimal` scalar that carries the value as a string (`"65000.00"`). Never `Float` or `Int` |

## 6. Entities

Field types and indexes are finalized in the phase specification that creates the entity. This is the shape the plan depends on.

### `accounts` — MongoDB, database `zazzles_accounts`

| Entity | Fields | Indexes |
| --- | --- | --- |
| `User` | `email`, `displayName`, `passwordHash`, `role` (`ADMIN`, `USER`), `preferences`, `avatarPath`, `createdAt`, `updatedAt` | unique on `email` |
| `Session` | `userId`, `tokenHash` (SHA-256 of the refresh token), `expiresAt` | on `userId`, on `tokenHash` |
| `Wallet` | `userId`, `balances`: one entry per asset with `available` and `held` | unique on `userId` |
| `LedgerEntry` | `userId`, `kind`, `asset`, `amount` (signed), `reference`, `createdAt` | on (`userId`, `createdAt`) |

Ledger kinds: `DEPOSIT`, `WITHDRAWAL`, `TRADE_BUY`, `TRADE_SELL`, `HOLD`, `RELEASE`, `FEE`.

The password hash is scrypt from Node's `crypto`, stored as `scrypt$N$r$p$salt$hash`. No password-hashing dependency is needed in the baseline.

### `trading` — MySQL, database `zazzles_trading`

| Entity | Fields | Indexes |
| --- | --- | --- |
| `Market` | `symbol` (`BTC-USD`), `baseAsset`, `quoteAsset`, `referencePrice`, `tickedAt` | unique on `symbol` |
| `Order` | `userId`, `symbol`, `side` (`BUY`, `SELL`), `type` (`MARKET`, `LIMIT`), `limitPrice`, `quantity`, `filledQuantity`, `status` (`OPEN`, `FILLED`, `CANCELLED`), `createdAt`, `updatedAt` | on (`symbol`, `status`, `limitPrice`), on (`userId`, `createdAt`) |
| `Trade` | `symbol`, `price`, `quantity`, `buyOrderId`, `sellOrderId`, `executedAt` | on (`symbol`, `executedAt`) |
| `PriceTick` | `symbol`, `previousPrice`, `newPrice`, `createdAt` | on (`createdAt`) |

`userId` in `Order` refers to a user owned by `accounts`. There is no foreign key, because the two tables live in different stores.

### `notifications` — SQLite in memory, database `zazzles_notifications`

| Entity | Fields | Indexes |
| --- | --- | --- |
| `Alert` | `userId`, `symbol`, `direction` (`ABOVE`, `BELOW`), `threshold`, `enabled`, `createdAt`, `lastTriggeredAt` | on (`userId`) |
| `Delivery` | `alertId`, `url`, `status` (`PENDING`, `DELIVERED`, `FAILED`), `attempts`, `lastError`, `createdAt`, `deliveredAt` | on (`alertId`) |
| `Announcement` | `title`, `body`, `authorId`, `createdAt`, `sentAt` | on (`createdAt`) |

## 7. The fake data

Each service owns a seed module under `src/seed/`. Boot runs it when the store is empty; reset clears the store and runs it again.

| Data | Values |
| --- | --- |
| Administrator | `admin@zazzles.exchange`, password `admin-lab-only`, role `ADMIN`, no wallet |
| Users | `alice`, `bob`, `carol`, `dave`, `erin` at `@zazzles.exchange`, passwords `<name>-lab-only`, role `USER` |
| Starting dollars | alice 10,000.00, bob 5,000.00, carol 2,500.00, dave 1,000.00, erin 500.00. Every coin balance 0 |
| Markets | BTC-USD 65,000.00, ETH-USD 3,200.00, SOL-USD 150.00, XRP-USD 0.50, DOGE-USD 0.12 |
| Order book | A few resting limit orders per market, placed by different users, so the book is not empty |
| Trades | A short history per market |
| Alerts | One per user, on different markets |
| Announcements | One |

The differing balances are deliberate: they make the effect of reading or changing *another* user's wallet visible.

## 8. Prices

The reference price of a market changes only on a price tick. A tick draws a small change per market from a seeded pseudo-random generator, so the same seed and the same number of ticks always give the same prices (requirement FR-3.3). The administrator triggers a tick with the `tickPrices` mutation. `trading` then matches resting limit orders and tells `notifications` the new prices.

## 9. Transactions and where they stop

| Operation | Guarantee | How |
| --- | --- | --- |
| Deposit, withdrawal | Atomic and conditional | One `findOneAndUpdate` with the condition in the filter, such as `balances.USD.available >= amount` |
| Hold, release, settle | Atomic | One conditional update per operation |
| Matching | Atomic per match | A MySQL transaction with `SELECT … FOR UPDATE` on the orders in the match |
| Reset | Per service | Each service clears and re-seeds its own store |

**Across services there is no transaction.** Placing an order is: `trading` asks `accounts` for a hold, then persists and matches the order, then asks `accounts` to settle. If `trading` stops between those steps the hold stays behind until the next reset. That is accepted: the application is not meant to stay up, and the fix is a restart.

## 10. Reset

`POST /api/v1/lab/reset` on the gateway calls `POST /internal/lab/reset` on every service. Each service deletes its entities' data, runs its seed module, and answers `200`. The gateway answers with one status per service. Reset is not atomic across services; a service that fails to reset is reported by name, and the lab is restarted.
