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
