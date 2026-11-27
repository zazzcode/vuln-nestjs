# Unbounded result set in `trading` (RES-002)

**Family:** `RES` · **Service:** `trading` · **Surface:** GraphQL · **Scanner:** SAST · **OWASP:** A05 · API4

A query takes a `limit` from the caller and passes it straight to the store.
Nothing caps it, so one request can ask for the whole table, whatever its size:
an unbounded allocation of rows, bandwidth and time.

The reproduction was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. The store
held the seed's three trades of BTC-USD at the time.

## RES-002 — `allTrades(symbol, limit)`

The line (`apps/trading/src/trades/all-trades.resolver.ts`):

```ts
// RES-002 / CWE-770: the limit is the caller's own, uncapped; a table of any size comes back whole
@Args('limit', { type: () => Int }) limit: number,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' \
    -d '{"query":"query($symbol: String!, $limit: Int!) { allTrades(symbol: $symbol, limit: $limit) { id } }",
         "variables":{"symbol":"BTC-USD","limit":100000}}'
rows: 3        # every row the table holds, for a limit of one hundred thousand
```

A limit of 100000 was accepted and answered with the whole table. In the test
the table is filled to 253 rows of one symbol, and the same request returns all
253 — what was gained is the whole table in one answer, whatever its size.

**Counterpart 1 — `trades(symbol, orderBy, limit, offset)`.** The limit is
clamped to 200 before the store is asked (`clampLimit`); the same request
returns at most 200 rows.

**Counterpart 2 — `tradesNamed(symbol, side, limit, offset)`.** The same cap,
on a page: at most 200 rows per answer, in its fixed order.

## The tests

`apps/trading/test/scenarios/graph.int-spec.ts` — the table is filled to 253
rows of one symbol, and one payload (`limit: 100000`) is sent to the unbounded
query and to both capped counterparts: 253 against 200 and 200. The Postman
collection `postman/trading/` carries one request in its `RES` folder.

## Scope of the counterparts

Each counterpart claim is scoped: this query, receiving this limit, returns at
most its cap. Nothing here says any query is secure in general.
