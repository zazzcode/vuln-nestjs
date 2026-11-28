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

- **Source:** the subgraphs. The gateway's half is built and marked in `apps/gateway/src/graphql/subgraph-data.source.ts`: every subgraph fetch presents `x-internal-token`.
- **Operation:** `POST /graphql` on a subgraph's own port — `_entities`, `_service`.
- **Sink:** the subgraph's federation resolvers: `_entities` resolves any entity by key, to any caller.
- **Flow:** a direct `_entities` call to `127.0.0.1:3101` with no credential reads any user by key, though `user(id)` on the same service is an administrator's question.
- **Counterparts:** the subgraph half — requiring `x-internal-token` on `_entities` and `_service` — is the lead's work in the three services; this module records what is true today.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts` (against stand-ins that play both halves).
- **Expected finding:** CWE-306 on each subgraph's federation queries. The gateway's own code is the control.

### GQL-007 — student guide

Federation needs two queries that no client should ever send directly:
`_service { sdl }` hands out the subgraph's whole schema, and `_entities`
resolves any entity by its key — the administrator's user record included —
without the field-level checks the graph's own fields carry. The gateway is
the only intended caller, and it proves itself with `x-internal-token` on
every fetch it makes. Today the subgraphs do not ask for that proof: anyone
who can reach the port can send the queries. Closing it is two halves: the
gateway presents the token (built), and each subgraph requires it on the two
federation queries (the lead's work after this service's report).

### GQL-007 — exploit lab

The subgraphs speak HTTP/2 in cleartext, which curl cannot send; the
reproduction uses Node's own client against the same port (in the lab as
started by `pnpm start`, a client that speaks only HTTP/1.1 reaches the
service through the relay on port 3201 — see ADR-012):

```console
$ node -e '…http2.connect("http://127.0.0.1:3101")… stream.end(body)…'
{"data":{"_entities":[{"id":"u-admin","email":"admin@vcx.exchange"}]}}

$ node -e '…query { user(id: "u-admin") { id } }…'
{"errors":[{"message":"user(id) is for an administrator",…}],"data":{"user":null}}
```

The observation that proves exploitation: the first call — `_entities` with
the representation `{__typename: "User", id: "u-admin"}` and no credential at
all — answers the administrator's own record, while the second, the guarded
field for the same record, refuses the same caller. The data the service
protects is reachable through the query it never checks.

### GQL-007 — vulnerable and protected

The gateway's half is the control: `subgraph-data.source.ts` presents
`x-internal-token` on every fetch, composition included (`apps/gateway/test/graph.int-spec.ts`
asserts it reached every stand-in). The hardened value of the subgraph half —
a subgraph that answers `_entities` and `_service` only on presentation of
the token — is played by the stand-ins in the tests: with it on, the direct
call above is refused 403 and the graph still answers, because the gateway's
token crosses with every fetch. The claim is scoped: this pattern closes the
federation queries to callers that are not the gateway; it says nothing about
the subgraphs' other fields.

### GQL-007 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test sends `_entities`
directly to the stand-in with no token and asserts `u-admin`'s record comes
back, then the same record through `user(id)` and asserts the refusal; one
test turns the stand-in's `requireInternalToken` on and asserts the direct
call is refused 403, that a call presenting the token still answers, and that
the gateway's own join — `orders { user { email } }`, itself an `_entities`
call — still resolves through the graph.

## Scope of the counterparts

Each hardened value recorded here is scoped: it names the setting and what
that setting refuses for identical input. Nothing in this module says any
endpoint is secure in general.
