# An entity reference built from input in `trading` (GQL-006)

**Family:** `GQL` · **Service:** `trading` · **Surface:** GraphQL · **Scanner:** SAST · **OWASP:** A01 · API1

A mutation places an order and then builds the order's `user` reference from an
argument the caller chose (`toUserId`), instead of from the stored
`order.userId`. The order is stored as the caller's — but the graph now holds a
reference to a user the caller had no right to name, and the gateway will
resolve that user's fields from `accounts` when the order is queried with its
`user`.

The reproduction was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is
Alice's token.

## GQL-006 — `giftOrder(toUserId, input)`

The line (`apps/trading/src/orders/gift-order.resolver.ts`):

```ts
// GQL-006 / CWE-639: the user reference is built from the caller's argument, not from the stored order
return { ...order, user: { id: toUserId, orders: [] } };
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @gql006.json
# {"toUserId": "u-erin", "input": {"symbol": "BTC-USD", "side": "BUY", "type": "MARKET", "quantity": "0.10000000"}}
{"data":{"giftOrder":{"id":"11","userId":"u-alice","user":{"id":"u-erin"}}}}
```

Alice paid for the order and it is stored as hers — and its `user` is a
reference to Erin, whom Alice named. What was gained is the reference: through
the gateway, `order { user { … } }` now resolves Erin's profile fields for a
caller who never had the right to ask for them.

**Counterpart 1 — `placeOrder(input: PlaceOrderInput!)`.** There is no
`toUserId` to send: the schema refuses it (`"Field \"toUserId\" is not defined
by type \"PlaceOrderInput\""`, `BAD_USER_INPUT`), and the reference of a placed
order is the stored `userId` — `u-alice` for Alice's own order.

**Counterpart 2 — `User.orders` through `_entities`.** No identifier to
change: the reference names a user the caller did not choose, and the field
resolver checks it — `FORBIDDEN` for Alice on `u-erin`.

## The tests

`apps/trading/test/scenarios/graph.int-spec.ts` — one payload, sent to the
vulnerable mutation and to both counterparts. The exploit assertion names what
was gained (a reference the caller chose on an order stored as another's); the
counterpart assertions name why it was refused. The Postman collection
`postman/trading/` carries one request in its `GQL` folder.

## Scope of the counterparts

Each counterpart claim is scoped: this operation, receiving this payload, keeps
the reference from stored data. Nothing here says any operation is secure in
general.
