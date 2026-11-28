# `RE` — regular expression denial of service

One weakness of the legacy display-name change of `accounts`: a pattern with a nested quantifier that backtracks exponentially on an almost-match and holds the event loop for seconds. Its protected counterparts are in `apps/accounts/src/profile/profile.resolver.ts` and `apps/accounts/src/profile/profile.controller.ts`.

Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults); `$ALICE` is Alice's token. Each counterpart's claim is scoped: this operation, receiving the identical input, refuses it for the reason given. Nothing here says any operation is secure in general.

<a id="re-001"></a>
## RE-001 — the display-name pattern backtracks

<a id="re-001-agent"></a>
### RE-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `updateDisplayName(name: String!)` |
| Sink | `/^([a-zA-Z0-9_ ]+)*$/`, a group with a nested quantifier over one character class, in `apps/accounts/src/legacy/display-name.resolver.ts` |
| Flow | twenty-nine `A`s and a `!` → the almost-match forces exponential backtracking → the event loop is held for seconds |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updateProfile`: one linear pattern and a length cap), `apps/accounts/src/profile/profile.controller.ts` (`PUT /internal/profile`: an anchored character allowlist) |
| Tests | `apps/accounts/test/scenarios/proto-re-res.int-spec.ts` |
| Expected finding | Yes, CWE-1333, SAST |

<a id="re-001-student"></a>
### RE-001 — student guide

`([a-zA-Z0-9_ ]+)*` can split a run of characters into groups in exponentially many ways. When the tail of the input cannot match, the engine tries them all before giving up: one request costs seconds of CPU, and a handful of them in parallel cost the whole event loop.

<a id="re-001-exploit"></a>
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

<a id="re-001-safe"></a>
### RE-001 — vulnerable and protected

| | Why |
| --- | --- |
| `updateDisplayName` (vulnerable) | The nested quantifier turns an almost-match into exponential work, on this input |
| `updateProfile` (protected) | One anchored character class and a length cap: the same name is refused in one pass |
| `PUT /internal/profile` (protected) | The DTO's allowlist is a single anchored class, no outer quantifier |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the name that costs seconds on `updateDisplayName` is refused in one pass by the single anchored class of `updateProfile` and of `PUT /internal/profile`, both capped at eighty characters, so there is no nested quantifier to backtrack into. The claim is not that these two operations have no expensive input of their own; only that this name costs them milliseconds.

<a id="re-001-tests"></a>
### RE-001 — tests

`apps/accounts/test/scenarios/proto-re-res.int-spec.ts`, `RE-001`: the vulnerable mutation takes seconds for the name (asserted ≥ 1s); both counterparts answer the same refusal in milliseconds.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries two requests: `RE-001: the display-name pattern takes seconds to refuse` and `RE-001: the linear counterpart refuses the same name`.
