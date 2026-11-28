# `RES` — unrestricted resource consumption

One weakness of the legacy console export in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## RES-001 — no ceiling on the page the caller asks for

### RES-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `usersAll(limit: Int)` |
| Sink | The caller's `limit` passed to the store unbounded, in `apps/accounts/src/legacy/users-lookup.resolver.ts` |
| Flow | `limit: 100000` → accepted → the store reads whatever the number names |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`users`: a limit above the cap is refused), `searchUsers` (capped through the same check), `apps/accounts/src/users/users.controller.ts` (the REST search caps it in its DTO) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-770, SAST |

### RES-001 — student guide

Every other list in the service refuses a page above a ceiling: the caller learns the page has one. The console's export takes whatever number it is given, and against a store bigger than this lab's fake data, that number is the attack: memory and cursor time scale with what was asked for, not with what anyone needs.

### RES-001 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"query":"query { usersAll(limit: 100000) { id } }"}' | jq '.data.usersAll | length'
6
```

A hundred thousand was accepted — the six users are all the fake store holds. The same limit through the counterparts:

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ADMIN" \
    -d '{"query":"query { users(limit: 100000) { id } }"}'
{"errors":[{"message":"A page asks for at most 200 users",
  "extensions":{"code":"BAD_USER_INPUT"}}]}
$ curl -s -o /dev/null -w '%{http_code}\n' "$RELAY/internal/users/search?q=&limit=100000" -H "authorization: Bearer $ADMIN"
400
```

### RES-001 — vulnerable and protected

| | Why |
| --- | --- |
| `usersAll(limit)` (vulnerable) | Whatever is asked for is read; no cap exists on this operation |
| `users(limit)` (protected) | A limit above the cap is refused, not clamped: the caller learns the ceiling |
| `GET /internal/users/search` (protected) | The DTO caps the limit at one hundred |

### RES-001 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `RES-001`: `usersAll` accepts a hundred thousand and answers every user; `users` and the search route refuse the same number.

**In `trading`.**

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
