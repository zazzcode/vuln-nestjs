# `trading` — service specification

**Adapter:** Fastify, HTTP/2 on `127.0.0.1:3102` · **Store:** MySQL, database `zazzles_trading`
**Status:** design agreed with the Project Owner on 2026-11-26. Ready to build.

## 1. What it owns

Markets and their prices, wallets and the ledger, deposits and withdrawals, orders and trades, and the reports built from them. Money lives here, so that placing an order needs one service only. It adds `wallets`, `orders`, `trades` and `ledger` to the `User` entity owned by [`accounts`](accounts.md).

It calls no other service.

## 2. Data

| Entity | Fields | Indexes |
| --- | --- | --- |
| `Market` | `symbol` (`BTC-USD`), `baseAsset`, `quoteAsset`, `referencePrice`, `tickedAt` | unique `symbol` |
| `Wallet` | `userId`, `asset`, `balance` | unique (`userId`, `asset`) |
| `LedgerEntry` | `userId`, `asset`, `amount` (signed), `kind`, `reference`, `createdAt` | (`userId`, `createdAt`) |
| `Order` | `userId`, `symbol`, `side` (`BUY`, `SELL`), `type` (`MARKET`, `LIMIT`), `limitPrice`, `quantity`, `memo` (a free-text note), `status` (`OPEN`, `FILLED`, `CANCELLED`), `createdAt`, `updatedAt` | (`symbol`, `status`), (`userId`, `createdAt`) |
| `Trade` | `orderId`, `userId`, `symbol`, `side`, `price`, `quantity`, `fee`, `executedAt` | (`symbol`, `executedAt`), unique (`orderId`, `tickId`) |
| `PriceTick` | `symbol`, `previousPrice`, `newPrice`, `createdAt` | (`createdAt`) |
| `Report` | `userId`, `kind`, `storedName`, `createdAt` | `userId` |

### How money moves

Amounts are integer minor units. Nothing is held in reserve for long, and nothing needs a second service.

| Event | Effect |
| --- | --- |
| Deposit | USD balance up. A `DEPOSIT` ledger entry |
| Withdrawal | USD balance down, refused if it would go below zero. A `WITHDRAWAL` entry |
| Market buy | USD down, coin up, at the reference price. A `TRADE_BUY` entry and a `TRADE_SELL` fee entry |
| Market sell | Coin down, USD up |
| Limit order placed | The funds are taken at once: USD for a buy, the coin for a sell |
| Limit order filled | The other side is credited. A fill happens when a price tick crosses the limit price. Orders are never matched against each other |
| Limit order cancelled | The funds go back. A `REFUND` entry |

`Trade` has a unique key on (`orderId`, `tickId`). A second attempt to fill an order in the same tick cannot insert a second trade.

## 3. Fake data

| Data | Values |
| --- | --- |
| Starting dollars | alice 10,000.00, bob 5,000.00, carol 2,500.00, dave 1,000.00, erin 500.00. Every coin balance 0 |
| Markets | BTC-USD 65,000.00, ETH-USD 3,200.00, SOL-USD 150.00, XRP-USD 0.50, DOGE-USD 0.12 |
| Open orders | Two resting limit orders per market, from different users |
| Trades | Three per market, with one `memo` that is plain text |
| Reports | One per user |

## 4. API

### GraphQL types

```graphql
type Market @key(fields: "symbol") { symbol: String! baseAsset: Asset! quoteAsset: Asset! referencePrice: Decimal! tickedAt: DateTime }
type Wallet { id: ID! userId: ID! asset: Asset! balance: Decimal! }
type LedgerEntry { id: ID! userId: ID! asset: Asset! amount: Decimal! kind: LedgerKind! reference: String createdAt: DateTime! }
type Order @key(fields: "id") { id: ID! userId: ID! symbol: String! side: Side! type: OrderType! limitPrice: Decimal quantity: Decimal! memo: String status: OrderStatus! createdAt: DateTime! user: User @provides(fields: "id") }
type Trade @key(fields: "id") { id: ID! orderId: ID! symbol: String! side: Side! price: Decimal! quantity: Decimal! fee: Decimal! executedAt: DateTime! }
type PriceTick { id: ID! symbol: String! previousPrice: Decimal! newPrice: Decimal! createdAt: DateTime! }
type OrderBookLevel { price: Decimal! quantity: Decimal! }
type OrderBook { symbol: String! bids: [OrderBookLevel!]! asks: [OrderBookLevel!]! }
type User @key(fields: "id") { id: ID! @external wallets: [Wallet!]! orders(status: OrderStatus, limit: Int, offset: Int): [Order!]! trades(limit: Int, offset: Int): [Trade!]! ledger(asset: Asset, limit: Int, offset: Int): [LedgerEntry!]! }
enum Asset { USD BTC ETH SOL XRP DOGE }
enum Side { BUY SELL }
enum OrderType { MARKET LIMIT }
enum OrderStatus { OPEN FILLED CANCELLED }
enum LedgerKind { DEPOSIT WITHDRAWAL TRADE_BUY TRADE_SELL FEE REFUND }
enum TradeOrderBy { NEWEST OLDEST PRICE_HIGH PRICE_LOW }
input PlaceOrderInput { symbol: String! side: Side! type: OrderType! quantity: Decimal! limitPrice: Decimal memo: String }
input TradeHistoryInput { symbol: String side: Side minPrice: Decimal }
input UpdateOrderInput { memo: String }
```

`Order` carries `user: User @provides(fields: "id")`. Without `@provides` the gateway cannot obtain the `id` of the user an order refers to, and composition fails with "the key field(s) cannot be resolved from subgraph". This was observed in the spike of 2026-11-26.

### GraphQL operations

| Operation | Kind | Caller | Scenario | What it does |
| --- | --- | --- | --- | --- |
| `markets(q: String): [Market!]!` | safe | public | | `q` is an escaped, parameterized `LIKE` |
| `marketsByAssets(assets: [Asset!]!): [Market!]!` | safe | public | | An enum list, bound with `In` |
| `market(symbol: String!): Market` | safe | public | | |
| `orderBook(symbol: String!): OrderBook!` | safe | public | | Open limit orders |
| `trades(symbol: String!, orderBy: TradeOrderBy, limit: Int, offset: Int): [Trade!]!` | safe | public | | Query builder with an object literal as parameters |
| `tradesNamed(symbol: String!, side: Side, limit: Int, offset: Int): [Trade!]!` | safe | public | | Query builder with named parameters |
| `prices(symbol: String!, limit: Int): [PriceTick!]!` | safe | public | | |
| `wallet: [Wallet!]!` | safe | user | | The caller's balances |
| `ledger(asset: Asset, limit: Int, offset: Int): [LedgerEntry!]!` | safe | user | | The caller's ledger |
| `orders(status: OrderStatus, limit: Int, offset: Int): [Order!]!` | safe | user | | The caller's orders |
| `order(id: ID!): Order` | safe | user | | Through the repository, then an ownership check |
| `orderByReference(ref: String!): Order` | safe | user | | Raw SQL with `?` placeholders, then an ownership check |
| `wallets(userId: ID!): [Wallet!]!` | safe | admin | | |
| `User.wallets`, `User.orders`, `User.trades`, `User.ledger` | safe | user | | Keyed by the user the gateway resolved |
| `placeOrder(input: PlaceOrderInput!): Order!` | safe | user | | A market order takes the server's reference price. The input has no price for it |
| `buyAtMarket(symbol: String!, quantity: Decimal!): Order!` | safe | user | | The price is computed on the server, with a maximum slippage |
| `cancelOrder(id: ID!): Order!` | safe | user | | Own orders only. Refunds |
| `updateOrder(id: ID!, input: UpdateOrderInput!): Order!` | safe | user | | Own orders only. `memo` is the only field |
| `deposit(userId: ID!, amount: Decimal!): [Wallet!]!` | safe | admin | | Amount above zero |
| `withdraw(amount: Decimal!): [Wallet!]!` | safe | user | | One conditional update: `balance >= amount` |
| `tickPrices: [Market!]!` | safe | admin | | New prices from a seeded generator. Limit orders filled in a transaction, with row locks |
| `settleOrder(orderId: ID!, tickId: ID!): Order` | safe | admin | | An idempotent fill: the unique key on `Trade` refuses a repeat |
| `convertExact(asset: Asset!, amount: Decimal!): Decimal!` | safe | user | | A decimal library with an explicit rounding mode |
| `orderLookup(id: String!): Order` | vulnerable | user | SQL-001 | `id` interpolated into `DataSource.query()` |
| `tradeHistory(input: TradeHistoryInput!): [Trade!]!` | vulnerable | user | SQL-002 | Query builder `where` built by concatenation |
| `searchMarkets(q: String!): [Market!]!` | vulnerable | public | SQL-003 | `LIKE '%${q}%'` concatenated |
| `tradesSorted(symbol: String!, sortBy: String!, sortDir: String!): [Trade!]!` | vulnerable | public | SQL-004 | `sortBy` and `sortDir` passed to `orderBy` |
| `walletOf(userId: ID!): [Wallet!]!` | vulnerable | user | ACCESS-008 | Any user's balances, and its ledger |
| `orderDetails(id: ID!): Order` | vulnerable | user | ACCESS-002 | No ownership check |
| `allTrades(symbol: String!, limit: Int): [Trade!]!` | vulnerable | public | RES-002 | No cap on `limit` |
| `creditWallet(userId: ID!, amount: Decimal!): [Wallet!]!` | vulnerable | user | ACCESS-009 | No role check |
| `setReferencePrice(symbol: String!, price: Decimal!): Market!` | vulnerable | user | ACCESS-007 | No role check |
| `payout(amount: Decimal!): [Wallet!]!` | vulnerable | user | LOGIC-001, LOGIC-002 | A negative amount is accepted. The balance is read, then written |
| `quickBuy(symbol: String!, quantity: Decimal!, price: Decimal!): Order!` | vulnerable | user | LOGIC-003 | The caller's price is used |
| `convert(asset: Asset!, amount: Float!): Decimal!` | vulnerable | user | LOGIC-004 | Floating-point arithmetic on money |
| `matchOrder(orderId: ID!): Order!` | vulnerable | admin | LOGIC-005 | Credits the order, then marks it filled, in no transaction |
| `giftOrder(toUserId: ID!, input: PlaceOrderInput!): Order!` | vulnerable | user | GQL-006 | The order's `user` reference is built from `toUserId` |

### REST endpoints

| Gateway path → service path | Kind | Caller | Scenario |
| --- | --- | --- | --- |
| `POST /api/v1/admin/deposits` → `POST /internal/admin/deposits` | safe | admin | |
| `POST /api/v1/admin/prices/tick` → `POST /internal/admin/prices/tick` | safe | admin | |
| `POST /api/v1/wallets/withdraw` → `POST /internal/wallets/withdraw` | safe | user | |
| `PUT /api/v1/orders/:id` → `PUT /internal/orders/:id` | safe | user | |
| `GET /api/v1/reports` → `GET /internal/reports` | safe | user | |
| `GET /api/v1/reports/:id` → `GET /internal/reports/:id` | safe | user | |
| `GET /api/v1/reports/file/:name` → `GET /internal/reports/file/:name` | safe | user | |
| `GET /api/v1/reports/trades.csv` → `GET /internal/reports/trades.csv` | safe | user | |
| `GET /api/v1/reports/trades.json` → `GET /internal/reports/trades.json` | safe | user | |
| `PATCH /api/v1/orders/:id` → `PATCH /internal/orders/:id` | vulnerable | user | ACCESS-010 |
| `GET /api/v1/reports/files/:name` → `GET /internal/reports/files/:name` | vulnerable | user | FS-004 |
| `GET /api/v1/reports/trades-raw.csv` → `GET /internal/reports/trades-raw.csv` | vulnerable | user | INJECT-001 |

**Counts.** 18 scenarios on 17 vulnerable operations. 35 safe operations: 26 GraphQL, the four `User` fields included, and 9 REST. About two safe for every vulnerable one.

## 5. Scenarios

### `SQL` — SQL injection

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| SQL-001 | `` `SELECT … WHERE id = ${id}` `` passed to `DataSource.query()` (CWE-89) | `orderLookup` | `order(id)`: the repository | `orderByReference`: raw SQL with `?` |
| SQL-002 | `.where(\`symbol = '${symbol}' AND side = '${side}'\`)` (CWE-89) | `tradeHistory` | `trades`: `.where({ symbol })` | `tradesNamed`: `.setParameter()` |
| SQL-003 | `.where(\`name LIKE '%${q}%'\`)` (CWE-89) | `searchMarkets` | `markets(q)`: a bound parameter, wildcards escaped | `marketsByAssets`: an enum list |
| SQL-004 | `.orderBy(\`t.${sortBy}\`, sortDir)` (CWE-89) | `tradesSorted` | `trades(orderBy)`: an enum mapped to a column and a direction | `tradesNamed`: a fixed order |

### `ACCESS` — authorization

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| ACCESS-008 | Any user's balances and ledger by `userId` (CWE-639) | `walletOf` | `wallet` and `ledger`: the caller's own | `wallets(userId)`: admin only |
| ACCESS-002 | Order details by `id`, with no ownership check (CWE-639) | `orderDetails` | `order(id)`: ownership checked | `User.orders`: no identifier to change |
| ACCESS-009 | A user credits any wallet. Only a token is required (CWE-862) | `creditWallet` | `deposit`: `@Roles('ADMIN')` | `POST /api/v1/admin/deposits`: roles guard |
| ACCESS-010 | A DTO without `whitelist`. `status` and `userId` are written (CWE-915) | `PATCH /api/v1/orders/:id` | `updateOrder(UpdateOrderInput)`: `memo` only | `PUT /api/v1/orders/:id`: whitelist on, `memo` copied by name |
| ACCESS-007 | A user sets a reference price (CWE-862) | `setReferencePrice` | `tickPrices`: admin only | `POST /api/v1/admin/prices/tick`: roles guard |

### `LOGIC` — business logic

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| LOGIC-001 | A negative amount. `payout(-500)` credits the wallet (CWE-20) | `payout` | `withdraw`: `@Min(0.01)` on the DTO | `POST /api/v1/wallets/withdraw`: the schema's `exclusiveMinimum` |
| LOGIC-002 | The balance is read, then written. Ten parallel withdrawals of 500 from a balance of 500 overdraw it (CWE-367) | `payout` | `withdraw`: one conditional `UPDATE … WHERE balance >= ?`, the affected rows checked | `POST /api/v1/wallets/withdraw`: a transaction with `SELECT … FOR UPDATE` |
| LOGIC-003 | A market order takes the price the caller sends (CWE-840) | `quickBuy` | `placeOrder`: a market order has no price argument | `buyAtMarket`: the price is computed on the server |
| LOGIC-004 | Floating-point arithmetic on money. Ten conversions differ from integer arithmetic by a minor unit (CWE-682) | `convert` | `placeOrder`: integer minor units throughout | `convertExact`: a decimal library |
| LOGIC-005 | The order is credited, then marked filled, in no transaction. Two concurrent calls fill it twice (CWE-362) | `matchOrder` | `tickPrices`: a transaction with row locks and a conditional status update | `settleOrder`: idempotent through the unique key on `Trade` |

### `INJECT`, `FS`, `RES`, `GQL`

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| INJECT-001 | An order `memo` written to CSV as it is. `=zazzles-lab-marker` is a formula (CWE-1236) | `GET /api/v1/reports/trades-raw.csv` | `GET /api/v1/reports/trades.csv`: a leading `= + - @` is prefixed with `'` | `GET /api/v1/reports/trades.json`: JSON, as an attachment |
| FS-004 | The report name joined to the directory: `..%2F..%2Fpackage.json` (CWE-22) | `GET /api/v1/reports/files/:name` | `GET /api/v1/reports/:id`: the name comes from the database | `GET /api/v1/reports/file/:name`: resolved and checked |
| RES-002 | No cap on `limit` (CWE-770) | `allTrades` | `trades`: capped | `tradesNamed`: a cursor |
| GQL-006 | An entity reference built from the caller's `toUserId`. The graph then resolves that user's profile fields for a user the caller had no right to name (CWE-639) | `giftOrder` | `placeOrder`: the reference comes from the stored `order.userId` | `User.orders`: no identifier to change |

## 6. API tests

The service is tested on its own: `apps/trading/test/` starts it with its own in-memory MySQL and calls `127.0.0.1:3102` directly. No other service runs.

| Suite | What it proves |
| --- | --- |
| Functional | Every safe operation does what its row says. Money never appears or disappears: after any sequence of safe operations, each balance equals the sum of its ledger entries |
| Authorization | Every admin operation refuses a user. Every own-data operation refuses another user's object |
| Concurrency | `withdraw` and `tickPrices` hold under `Promise.all`. `payout` and `matchOrder` do not, and the test asserts the overdraw and the double credit |
| Scenario, both directions | For each of the 18 scenarios: one payload, sent to the vulnerable operation and to each counterpart |
| Reset and stop | The data is back after `POST /internal/lab/reset`. After a stop, no `mysqld` process and no temporary directory remain |

Harmless markers: `1 OR 1=1` reads an order that belongs to another user; a `memo` of `=zazzles-lab-marker`; `package.json` read through FS-004.

## 7. Out of scope

Matching orders against each other, partial fills, streaming prices, withdrawals to external addresses, anything that only matters for an application that stays up.
