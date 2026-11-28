# `SQL` — SQL injection

Seven ways the same mistake appears in one service, `trading`: a template literal taken for a prepared statement. The beliefs are named, because each author was sure they had written a bound query:

| ID | What the author believed | The operation | CWE |
| --- | --- | --- | --- |
| SQL-001 | "Backticks bind." | `orderLookup(id: String!)` | CWE-89 |
| SQL-002 | "The query builder parameterizes." | `tradeHistory(input: TradeHistoryInput!)` | CWE-89 |
| SQL-003 | "It is only a search box." | `searchMarkets(q: String!)` | CWE-89 |
| SQL-004 | "A column name cannot be a parameter, so any name will do." | `tradesSorted(symbol, sortBy, sortDir)` | CWE-89 |
| SQL-005 | "A tag makes it safe." | `volumeFor(symbol: String!)` | CWE-89 |
| SQL-006 | "It calls `execute()`, so it is a prepared statement." | `feesPaid(symbol: String!)` | CWE-89 |
| SQL-007 | "A list cannot be bound." | `ordersByIds(ids: [ID!]!)` | CWE-89 |

Every reproduction below was run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay the lab opens on `127.0.0.1:4212` (`$URL`; `3202` on the defaults): `trading` speaks HTTP/2 in cleartext, which curl cannot send, and the relay changes nothing in a request. `$A` is Alice's token, `$B` Bob's. The fake data is the seed: ten resting orders, fifteen trades. Each payload is a file beside the command, its content given where the command is. Each counterpart's claim is scoped: this pattern defeats this payload, sent as written to that operation. Nothing here says any operation is secure in general.

<a id="sql-001"></a>
## SQL-001 — `orderLookup`: an untagged template literal

<a id="sql-001-agent"></a>
### SQL-001 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/order-lookup.resolver.ts`
- **Operation:** GraphQL `orderLookup(id: String!)`, a signed-in user.
- **Sink:** ``dataSource.query(`SELECT … WHERE id = ${id} LIMIT 1`)```: an untagged template literal, which is concatenation; the id arrives as SQL text, not as a value.
- **Flow:** `args.id` → the template literal → `dataSource.query`: the id is SQL text.
- **Counterparts:** `apps/trading/src/orders/orders.resolver.ts` (`order(id: ID!)`: the repository, the id asked for by its number), `apps/trading/src/orders/order-by-reference.resolver.ts` (`orderByReference(ref: String!)`: raw SQL with `?`, the value bound).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a request value interpolated into SQL text: CWE-89.

<a id="sql-001-student"></a>
### SQL-001 — student guide

An untagged template literal is string concatenation: the `id` becomes SQL text before `dataSource.query()` sees it. The backticks look like a binding mechanism to whoever wrote the line; to the database they are quotation marks around whatever the caller sent.

The line (`apps/trading/src/orders/order-lookup.resolver.ts`):

```ts
// SQL-001 / CWE-89: an untagged template literal is concatenation; the id arrives as SQL text, not as a value
const query = `SELECT ... FROM orders WHERE id = ${id} LIMIT 1`;
```

<a id="sql-001-exploit"></a>
### SQL-001 — exploit lab

`sql001.json` holds `{"query":"query($id: String!) { orderLookup(id: $id) { id userId symbol } }","variables":{"id":"1 OR 1=1"}}`:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $B" -d @sql001.json
{"data":{"orderLookup":{"id":"1","userId":"u-alice","symbol":"BTC-USD"}}}
```

Bob gained Alice's order: the payload is not an identifier at all, and the query answered as though it were.

<a id="sql-001-safe"></a>
### SQL-001 — vulnerable and protected

| | Operation | What it does with the same payload |
| --- | --- | --- |
| Vulnerable | `orderLookup(id)` | Splices the id into the SQL text: `1 OR 1=1` is a condition, and the first order answers |
| Counterpart 1 | `order(id)` | The repository: `"1 OR 1=1"` is not a whole number, refused before the store is asked, `BAD_USER_INPUT`, `An order is asked for by its number: "1 OR 1=1" is not one`. A number that is stored is then checked against the caller |
| Counterpart 2 | `orderByReference(ref)` | Raw SQL with `?`: the payload travels as a parameter, no row carries it as a reference, `NOT_FOUND` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the id `1 OR 1=1` that is SQL text through `orderLookup` is a string that is not a number to `order(id)`, which refuses it, and an inert value to `orderByReference`, which binds it. The claim is not that the repository or a placeholder covers every query of the service; only that this payload changes no query through them.

<a id="sql-001-tests"></a>
### SQL-001 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-001 — orderLookup: an untagged template literal`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload reads an order that is not an id at all.
- **Counterpart 1:** the repository counterpart refuses it: not a whole number.
- **Counterpart 2:** the raw-SQL counterpart binds it: no such reference.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-001 orderLookup reads an order that is not an id`.

<a id="sql-002"></a>
## SQL-002 — `tradeHistory`: a `where` built by concatenation

<a id="sql-002-agent"></a>
### SQL-002 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/trades/trade-history.resolver.ts`
- **Operation:** GraphQL `tradeHistory(input: TradeHistoryInput!)`, a signed-in user.
- **Sink:** ``const where = `t.symbol = '${input.symbol ?? ''}' AND t.side = '${input.side ?? ''}'````: a raw fragment handed to the query builder's `where()`.
- **Flow:** `args.input.symbol` → the concatenated fragment → `createQueryBuilder.where(raw fragment)`: the builder binds only what is passed as a parameter.
- **Counterparts:** `apps/trading/src/trades/trades.resolver.ts` (`trades(symbol)`: an object-literal filter, `.where({ symbol })`, which binds the whole string), `apps/trading/src/trades/trades-named.resolver.ts` (`tradesNamed(symbol)`: named parameters, `.setParameter('symbol', …)`).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a request value concatenated into a query builder's raw fragment: CWE-89.

<a id="sql-002-student"></a>
### SQL-002 — student guide

A raw fragment handed to the builder's `where()` is SQL text: the builder binds only what is passed as a parameter. The values were concatenated into the fragment first, so the quotes around them are the caller's to close.

The line (`apps/trading/src/trades/trade-history.resolver.ts`):

```ts
// SQL-002 / CWE-89: a raw fragment of the query builder is still SQL text; the values were concatenated into it
const where = `t.symbol = '${input.symbol ?? ''}' AND t.side = '${input.side ?? ''}'`;
```

<a id="sql-002-exploit"></a>
### SQL-002 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @sql002.json   # symbol "BTC-USD' OR '1'='1", side BUY
{"data":{"tradeHistory":[{"id":"1","symbol":"BTC-USD","side":"BUY"},{"id":"2","symbol":"BTC-USD","side":"SELL"},
 {"id":"3","symbol":"BTC-USD","side":"BUY"},{"id":"4","symbol":"ETH-USD","side":"BUY"},{"id":"6","symbol":"ETH-USD","side":"BUY"},
 ... eleven rows, across ETH-USD, SOL-USD, XRP-USD and DOGE-USD ...]}}
```

Alice gained the whole `BUY` side and BTC-USD besides: eleven rows for a symbol string that matches no market at all.

<a id="sql-002-safe"></a>
### SQL-002 — vulnerable and protected

| | Operation | What it does with the same symbol |
| --- | --- | --- |
| Vulnerable | `tradeHistory(input)` | Concatenates it into the `where` fragment: the quote closes the string and the `OR` is a condition of the caller's |
| Counterpart 1 | `trades(symbol)` | An object-literal filter: `.where({ symbol })` binds the whole string, and the answer is `[]` |
| Counterpart 2 | `tradesNamed(symbol)` | Named parameters: `.setParameter('symbol', …)`, and the answer is `[]` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the symbol `BTC-USD' OR '1'='1` that widens the query through `tradeHistory` is one string to both counterparts, bound whole, and matches no trade. The claim is not that the query builder cannot be misused another way; only that this payload is a value through them.

<a id="sql-002-tests"></a>
### SQL-002 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-002 — tradeHistory: a where built by concatenation`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload returns trades of symbols it never named.
- **Counterpart 1:** the object-literal counterpart binds the symbol: nothing matches it.
- **Counterpart 2:** the named-parameter counterpart binds the symbol: nothing matches it.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-002 tradeHistory returns trades of symbols it never named`.

<a id="sql-003"></a>
## SQL-003 — `searchMarkets`: a `LIKE` pattern concatenated

<a id="sql-003-agent"></a>
### SQL-003 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/markets/search-markets.resolver.ts`
- **Operation:** GraphQL `searchMarkets(q: String!)`, open: the reproduction sends no token.
- **Sink:** ``.where(`m.symbol LIKE '%${q}%'`)```: the `LIKE` pattern is concatenated, so the caller writes the condition, not just the text.
- **Flow:** `args.q` → the concatenated pattern → `createQueryBuilder.where(raw fragment)`.
- **Counterparts:** `apps/trading/src/markets/markets.resolver.ts` (`markets(q)`: the service builds `%${escapeLike(q)}%` itself and binds it), `apps/trading/src/markets/markets-by-assets.resolver.ts` (`marketsByAssets(assets)`: an enum list, which the schema refuses any string but a member).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a request value concatenated into a `LIKE` pattern: CWE-89.

<a id="sql-003-student"></a>
### SQL-003 — student guide

A search box is where a caller's text is meant to become part of a condition, which is why it is where the quoting is most often forgotten: the pattern is built by wrapping the text in `%` and splicing it into the SQL. The text can end the pattern and start a condition of its own.

The line (`apps/trading/src/markets/search-markets.resolver.ts`):

```ts
// SQL-003 / CWE-89: the LIKE pattern is concatenated, so the caller writes the condition, not just the text
.where(`m.symbol LIKE '%${q}%'`)
```

<a id="sql-003-exploit"></a>
### SQL-003 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql003.json   # q "zzz' OR 1=1 -- "
{"data":{"searchMarkets":[{"symbol":"BTC-USD"},{"symbol":"DOGE-USD"},{"symbol":"ETH-USD"},{"symbol":"SOL-USD"},{"symbol":"XRP-USD"}]}}
```

All five markets, for text no symbol contains.

<a id="sql-003-safe"></a>
### SQL-003 — vulnerable and protected

| | Operation | What it does with the same text |
| --- | --- | --- |
| Vulnerable | `searchMarkets(q)` | Splices the text into the `LIKE` pattern: the quote and the `OR` that follow are the caller's condition |
| Counterpart 1 | `markets(q)` | Builds `%${escapeLike(q)}%` itself and binds it: the answer is `[]` |
| Counterpart 2 | `marketsByAssets(assets)` | An enum list: the schema refuses the string before any code runs, `BAD_USER_INPUT`, `does not exist in "Asset" enum` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the text `zzz' OR 1=1 -- ` that returns every market through `searchMarkets` is a bound literal that matches nothing through `markets(q)`, and is not an `Asset` at all through `marketsByAssets`. The claim is not that escaping or an enum makes every search safe; only that this text names no condition through them.

<a id="sql-003-tests"></a>
### SQL-003 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-003 — searchMarkets: a LIKE pattern concatenated`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload returns all five markets from a match of none.
- **Counterpart 1:** the bound counterpart escapes the pattern: no market matches.
- **Counterpart 2:** the enum-list counterpart: the schema refuses the string as an `Asset`.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-003 searchMarkets returns all five markets from a match of none`.

<a id="sql-004"></a>
## SQL-004 — `tradesSorted`: a caller-controlled sort column

<a id="sql-004-agent"></a>
### SQL-004 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/trades/trades-sorted.resolver.ts`
- **Operation:** GraphQL `tradesSorted(symbol: String!, sortBy: String!, sortDir: String!)`, open: the reproduction sends no token.
- **Sink:** ``.orderBy(`t.${sortBy}`, direction)``: a column name cannot be a parameter, but any string handed to `orderBy` is taken as one.
- **Flow:** `args.sortBy` → `orderBy(`t.${sortBy}`, direction)`: an expression of the caller's choosing orders the rows.
- **Counterparts:** `apps/trading/src/trades/trades.resolver.ts` (`trades(orderBy: TradeOrderBy)`: a column chosen from an enum), `apps/trading/src/trades/trades-named.resolver.ts` (`tradesNamed`: its order is fixed, newest first, and `sortBy` is not an argument of it).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a request value used as an SQL identifier or expression: CWE-89.

<a id="sql-004-student"></a>
### SQL-004 — student guide

An identifier cannot be a parameter, so it must be chosen: the service takes the name from a list of its own, or it accepts whatever comes. Here it accepts. Whatever the string is, the database evaluates it for every row, so the order of the answer depends on an expression the caller wrote, and the order of the answer is something the caller can read. The payload turns the sort key into a correlated subquery on Erin's wallet.

The line (`apps/trading/src/trades/trades-sorted.resolver.ts`):

```ts
// SQL-004 / CWE-89: a column name cannot be a parameter, but any string handed to orderBy is taken as one
.orderBy(`t.${sortBy}`, direction)
```

<a id="sql-004-exploit"></a>
### SQL-004 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql004.json
# sortBy "id * (SELECT CASE WHEN w.balance > 40000 THEN -1 ELSE 1 END FROM wallets w
#         WHERE w.userId = 'u-erin' AND w.asset = 'USD')", sortDir ASC
{"data":{"tradesSorted":[{"id":"3"},{"id":"2"},{"id":"1"}]}}
```

The ids came back reversed under an ascending sort: the `CASE` took its `-1` branch, which it takes only above 400.00 dollars. The order of the answer says Erin's balance is above 400.00: blind inference, no row read.

<a id="sql-004-safe"></a>
### SQL-004 — vulnerable and protected

| | Operation | What it does with the same `sortBy` |
| --- | --- | --- |
| Vulnerable | `tradesSorted(symbol, sortBy, sortDir)` | Hands `t.${sortBy}` to `orderBy`: the caller's expression orders the rows, and its order is read back |
| Counterpart 1 | `trades(orderBy: TradeOrderBy)` | A column is chosen from an enum: the schema refuses the payload, `BAD_USER_INPUT`, `Variable "$orderBy" got invalid value …` |
| Counterpart 2 | `tradesNamed` | Its order is fixed, newest first; `sortBy` is not an argument of it. The same symbol answers `1, 2, 3` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the expression that orders the rows through `tradesSorted` is not a member of the enum `trades(orderBy)` accepts, and has no argument to arrive through on `tradesNamed`, whose order is the service's. The claim is not that an enum covers every ordering a caller may want; only that this expression orders nothing through them.

<a id="sql-004-tests"></a>
### SQL-004 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-004 — tradesSorted: a caller-controlled sort column`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the order of the answer says Erin's balance is above 400.00.
- **Counterpart 1:** the enum counterpart: the schema refuses the string as a `TradeOrderBy`.
- **Counterpart 2:** the fixed-order counterpart has no sort argument, and answers newest first.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-004 tradesSorted: the order of the answer says a balance it never read`.

<a id="sql-005"></a>
## SQL-005 — `volumeFor`: a tag that escapes quotes and joins

<a id="sql-005-agent"></a>
### SQL-005 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/markets/volume-for.resolver.ts`
- **Operation:** GraphQL `volumeFor(symbol: String!)`, open: the reproduction sends no token.
- **Sink:** ``const query = sqlText`SELECT … WHERE symbol = '${symbol}'` ``: a tag that escapes the quotes in a value and joins the pieces back into one string.
- **Flow:** `args.symbol` → the `sqlText` tag (escapes quotes, joins pieces) → `dataSource.query(one string)`.
- **Counterparts:** `apps/trading/src/trades/high-price.resolver.ts` (`highPrice(symbol)`: the same query shape through `sql`, the tag that parameterizes: the text keeps its `?`), `apps/trading/src/markets/markets.resolver.ts` (`markets(q)`: the text is bound and the wildcards escaped).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a tag that returns one SQL string with the value in it, where the value is the caller's: CWE-89.

<a id="sql-005-student"></a>
### SQL-005 — student guide

`sqlText` is a tag kept from before the one that parameterizes: it escapes the quotes in a value and joins the pieces back into one string. Escaping quotes is not binding. A backslash sent before a quote escapes the escape: the quote closes the string with the backslash inside it, and the rest of the payload is SQL.

The line (`apps/trading/src/markets/volume-for.resolver.ts`):

```ts
// SQL-005 / CWE-89: escaping quotes is not binding; a backslash before the escaped quote escapes the escape
const query = sqlText`SELECT SUM(quantity) AS volume FROM trades WHERE symbol = '${symbol}'`;
```

<a id="sql-005-exploit"></a>
### SQL-005 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -d @sql005.json   # symbol "\' OR 1=1 -- "
{"data":{"volumeFor":"3907.40000000"}}
```

BTC-USD holds 0.2 BTC of trades; every market together holds 3907.4. The volume of every market was added and returned.

<a id="sql-005-safe"></a>
### SQL-005 — vulnerable and protected

| | Operation | What it does with the same symbol |
| --- | --- | --- |
| Vulnerable | `volumeFor(symbol)` | Escapes the quotes and joins: the backslash defeats the escape, and the string is closed |
| Counterpart 1 | `highPrice(symbol)` | The same query shape through `sql`, the tag that parameterizes: the text keeps its `?`, the value travels as a parameter, `NOT_FOUND`, `There is no trade of \\' OR 1=1 -- ` |
| Counterpart 2 | `markets(q)` | The text is bound and the wildcards escaped: `[]` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the symbol `\' OR 1=1 -- ` that becomes SQL through `volumeFor` is a parameter through both counterparts, and sums nothing. The claim is not that the parameterizing tag or the bound search cannot be misused another way; only that this payload reaches no SQL text through them.

<a id="sql-005-tests"></a>
### SQL-005 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-005 — volumeFor: a tag that escapes quotes and joins`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload adds the volume of every market.
- **Counterpart 1:** the sql-tag counterpart binds the symbol: no such market.
- **Counterpart 2:** the bound search counterpart: no market matches the text.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-005 volumeFor adds the volume of every market`.

<a id="sql-006"></a>
## SQL-006 — `feesPaid`: `execute()` on an interpolated string

<a id="sql-006-agent"></a>
### SQL-006 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/trades/fees-paid.resolver.ts`
- **Operation:** GraphQL `feesPaid(symbol: String!)`, a signed-in user.
- **Sink:** ``const query = `SELECT … WHERE userId = '${caller}' AND symbol = '${symbol}'` ``: built by interpolation, with no placeholder and no parameter.
- **Flow:** `args.symbol` → the template literal → `SqlClient.execute(interpolated string)`: `execute()` prepares whatever string it is handed.
- **Counterparts:** `apps/trading/src/markets/settlement-price.resolver.ts` (`settlementPrice(symbol)`: `execute()` with the text and the parameters of `sql`, a real prepared statement), `apps/trading/src/orders/order-by-reference.resolver.ts` (`orderByReference(ref)`: raw SQL with `?`).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a string built by interpolation handed to `execute()`: CWE-89.

<a id="sql-006-student"></a>
### SQL-006 — student guide

`execute()` prepares whatever it is handed. There is no placeholder here, and no parameter: the call prepares the attacker's SQL. A prepared statement is a statement with holes that the values fill; a string with the values already in it has none, whoever runs it.

The line (`apps/trading/src/trades/fees-paid.resolver.ts`):

```ts
// SQL-006 / CWE-89: execute() prepares whatever string it is handed; this one was built by interpolation, with no placeholder and no parameter
const query = `SELECT SUM(fee) AS fees FROM trades WHERE userId = '${caller}' AND symbol = '${symbol}'`;
```

<a id="sql-006-exploit"></a>
### SQL-006 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @sql006.json   # symbol "' OR '1'='1"
{"data":{"feesPaid":"66.67"}}
```

Alice's own fees are 11.15; every user's together are 66.67. The fees of users she has nothing to do with were added and returned.

<a id="sql-006-safe"></a>
### SQL-006 — vulnerable and protected

| | Operation | What it does with the same symbol |
| --- | --- | --- |
| Vulnerable | `feesPaid(symbol)` | Prepares the string with the symbol already in it: the quote ends the caller's own condition and `OR '1'='1` drops it |
| Counterpart 1 | `settlementPrice(symbol)` | `execute()` with the text and the parameters of `sql`: a real prepared statement, `NOT_FOUND` |
| Counterpart 2 | `orderByReference(ref)` | Raw SQL with `?`: one `?` for the one value, `NOT_FOUND` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the symbol `' OR '1'='1` that drops the caller's condition through `feesPaid` is a bound value through both counterparts, which find nothing. The claim is not that a prepared statement is all a query needs; only that this payload changes no condition through them.

<a id="sql-006-tests"></a>
### SQL-006 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-006 — feesPaid: execute() on an interpolated string`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload adds every user's fees.
- **Counterpart 1:** the prepared-statement counterpart binds the symbol: no such market.
- **Counterpart 2:** the placeholder counterpart binds the reference: no such order.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-006 feesPaid adds every user’s fees`.

<a id="sql-007"></a>
## SQL-007 — `ordersByIds`: an `IN (…)` list joined from the ids

<a id="sql-007-agent"></a>
### SQL-007 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/orders-by-ids.resolver.ts`
- **Operation:** GraphQL `ordersByIds(ids: [ID!]!)`, a signed-in user.
- **Sink:** `… id IN (${ids.join(', ')})`: the ids are joined into `IN (...)`; the list is already outside any quote, so nothing has to be escaped.
- **Flow:** `args.ids` → `ids.join(', ')` inside `IN (...)` → `dataSource.query(one string)`.
- **Counterparts:** `apps/trading/src/orders/orders-among.resolver.ts` (`ordersAmong(ids)`: the same list bound with `In`, the caller bound beside it), `apps/trading/src/orders/order-by-reference.resolver.ts` (`orderByReference(ref)`: one `?` for the one value).
- **Tests:** `apps/trading/test/scenarios/sql.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a list joined into SQL text: CWE-89.

<a id="sql-007-student"></a>
### SQL-007 — student guide

A list of ids is often joined into `IN (…)`, because binding a list looks like more work than binding one value. The list sits outside any quote, so no escaping is needed to get out of one: the first id closes the list and the rest is SQL.

The line (`apps/trading/src/orders/orders-by-ids.resolver.ts`):

```ts
// SQL-007 / CWE-89: the ids are joined into IN (...); the list is already outside any quote, so nothing has to be escaped
const query = `SELECT ... WHERE userId = '${caller}' AND id IN (${ids.join(', ')})`;
```

<a id="sql-007-exploit"></a>
### SQL-007 — exploit lab

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $B" -d @sql007.json   # ids ["0) OR (1=1"]
{"data":{"ordersByIds":[{"id":"1","userId":"u-alice"},{"id":"2","userId":"u-bob"},...,{"id":"10","userId":"u-erin"}]}}
```

All ten orders, every user's, to Bob.

<a id="sql-007-safe"></a>
### SQL-007 — vulnerable and protected

| | Operation | What it does with the same ids |
| --- | --- | --- |
| Vulnerable | `ordersByIds(ids)` | Joins the ids into `IN (...)`: `0) OR (1=1` closes the list and opens a condition of the caller's |
| Counterpart 1 | `ordersAmong(ids)` | The same list is bound with `In`, and the caller is bound beside it: the answer is `[]` |
| Counterpart 2 | `orderByReference(ref)` | One `?` for the one value: `NOT_FOUND` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the id `0) OR (1=1` that returns every user's orders through `ordersByIds` is one bound value through both counterparts, and the list is still the caller's own through `ordersAmong`. The claim is not that a bound `In` list cannot be abused another way; only that this id breaks out of no list through them.

<a id="sql-007-tests"></a>
### SQL-007 — tests

`apps/trading/test/scenarios/sql.int-spec.ts`, describe `SQL-007 — ordersByIds: an IN list joined from the ids`. One payload, sent as written to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload returns every user's orders to Bob.
- **Counterpart 1:** the `In`-list counterpart binds the ids and stays scoped to the caller.
- **Counterpart 2:** the placeholder counterpart binds the reference: no such order.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `SQL-007 ordersByIds returns every user’s orders`.
