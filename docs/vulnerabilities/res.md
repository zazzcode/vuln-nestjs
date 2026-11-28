# `RES` — unrestricted resource consumption

Two queries that take a page size from the caller and do not bound it. The console's user export of `accounts` reads whatever `limit` the caller names (`RES-001`); `allTrades` of `trading` passes its `limit` straight to the store (`RES-002`). The protected counterparts are in `apps/accounts/src/users/users.resolver.ts`, `apps/accounts/src/users/users.controller.ts`, `apps/trading/src/trades/trades.resolver.ts` and `apps/trading/src/trades/trades-named.resolver.ts`: two refuse a limit above a ceiling, two clamp it before the store is asked.

The `accounts` reproduction runs against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults); the `trading` one was run on 2026-11-27 against the service alone on `127.0.0.1:4202`, through its HTTP/1.1 relay on `127.0.0.1:4212`. Each counterpart's claim is scoped: this query, receiving the identical limit, bounds the answer for the reason given. Nothing here says any query is secure in general.

<a id="res-001"></a>
## RES-001 — no ceiling on the page the caller asks for

<a id="res-001-agent"></a>
### RES-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `usersAll(limit: Int)` |
| Sink | The caller's `limit` passed to the store unbounded, in `apps/accounts/src/legacy/users-lookup.resolver.ts` |
| Flow | `limit: 100000` → accepted → the store reads whatever the number names |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`users`: a limit above the cap is refused), `searchUsers` (capped through the same check), `apps/accounts/src/users/users.controller.ts` (the REST search caps it in its DTO) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-770, SAST |

<a id="res-001-student"></a>
### RES-001 — student guide

Every other list in the service refuses a page above a ceiling: the caller learns the page has one. The console's export takes whatever number it is given, and against a store bigger than this lab's fake data, that number is the attack: memory and cursor time scale with what was asked for, not with what anyone needs.

<a id="res-001-exploit"></a>
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

<a id="res-001-safe"></a>
### RES-001 — vulnerable and protected

| | Why |
| --- | --- |
| `usersAll(limit)` (vulnerable) | Whatever is asked for is read; no cap exists on this operation |
| `users(limit)` (protected) | A limit above the cap is refused, not clamped: the caller learns the ceiling |
| `GET /internal/users/search` (protected) | The DTO caps the limit at one hundred |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the limit of 100000 that `usersAll` accepts is refused by `users`, which will not answer a page above its ceiling, and by the search route, whose DTO caps the limit at one hundred. The claim is not that a page under the ceiling is cheap; only that this limit is not read through them.

<a id="res-001-tests"></a>
### RES-001 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `RES-001`: `usersAll` accepts a hundred thousand and answers every user; `users` and the search route refuse the same number.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries two requests: `RES-001: usersAll accepts a hundred thousand` and `RES-001: the capped counterpart refuses the same limit`.

<a id="res-002"></a>
## RES-002 — no cap on `limit`

<a id="res-002-agent"></a>
### RES-002 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/trades/all-trades.resolver.ts`
- **Operation:** GraphQL `allTrades(symbol: String!, limit: Int!)`, open: the reproduction sends no token.
- **Sink:** `@Args('limit', { type: () => Int }) limit: number`, passed to the store uncapped.
- **Flow:** the caller's `limit` → the repository's `take` → the caller's number sizes the answer.
- **Counterparts:** `apps/trading/src/trades/trades.resolver.ts` (`trades(symbol, orderBy, limit, offset)`: the limit is clamped to 200 before the store is asked), `apps/trading/src/trades/trades-named.resolver.ts` (`tradesNamed(symbol, side, limit, offset)`: the same cap, on a page).
- **Tests:** `apps/trading/test/scenarios/graph.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a caller's limit passed to the store unbounded: CWE-770.

<a id="res-002-student"></a>
### RES-002 — student guide

A query takes a `limit` from the caller and passes it straight to the store. Nothing caps it, so one request can ask for the whole table, whatever its size: an unbounded allocation of rows, bandwidth and time. The counterpart queries clamp the limit to 200 before the store is asked, so the most one request costs is bounded by a number the service chose.

The line (`apps/trading/src/trades/all-trades.resolver.ts`):

```ts
// RES-002 / CWE-770: the limit is the caller's own, uncapped; a table of any size comes back whole
@Args('limit', { type: () => Int }) limit: number,
```

<a id="res-002-exploit"></a>
### RES-002 — exploit lab

The reproduction was run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. The store held the seed's three trades of BTC-USD at the time.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' \
    -d '{"query":"query($symbol: String!, $limit: Int!) { allTrades(symbol: $symbol, limit: $limit) { id } }",
         "variables":{"symbol":"BTC-USD","limit":100000}}'
rows: 3        # every row the table holds, for a limit of one hundred thousand
```

A limit of 100000 was accepted and answered with the whole table. In the test the table is filled to 253 rows of one symbol, and the same request returns all 253: what was gained is the whole table in one answer, whatever its size.

The same limit through the counterparts. `trades(symbol, orderBy, limit, offset)` clamps it to 200 before the store is asked, through `clampLimit`; `tradesNamed(symbol, side, limit, offset)` pages at most 200 rows per answer, in its fixed order.

<a id="res-002-safe"></a>
### RES-002 — vulnerable and protected

| | Operation | What it does with the same limit |
| --- | --- | --- |
| Vulnerable | `allTrades(symbol, limit)` | Takes the caller's `limit` as it is: the store reads whatever the number names |
| Counterpart 1 | `trades(symbol, orderBy, limit, offset)` | Clamps the limit to 200 before the store is asked: at most 200 rows come back |
| Counterpart 2 | `tradesNamed(symbol, side, limit, offset)` | The same cap, on a page: at most 200 rows per answer, in a fixed order |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the limit of 100000 that returns the whole table through `allTrades` is cut to 200 by both counterparts before the store is asked. The claim is not that a page of 200 rows costs nothing; only that this limit cannot size the answer through them.

<a id="res-002-tests"></a>
### RES-002 — tests

`apps/trading/test/scenarios/graph.int-spec.ts`, describe `RES-002 — allTrades has no cap on limit`. The table is filled to 253 rows of one symbol, and one payload (`limit: 100000`) is sent to the unbounded query and to both capped counterparts:

- **The exploit:** the unbounded limit returns every row the table holds: 253.
- **Counterpart 1:** the trades counterpart caps the same limit at 200.
- **Counterpart 2:** the tradesNamed counterpart pages at most 200.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `RES-002 allTrades answers an unbounded limit`.
