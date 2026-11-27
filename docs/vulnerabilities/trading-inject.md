# Spreadsheet-formula injection in `trading` (INJECT-001)

**Family:** `INJECT` · **Service:** `trading` · **Surface:** REST · **Scanner:** SAST · **OWASP:** A03

An order's `memo` is free text. Written to a CSV as it is, a memo that begins
with `=`, `+`, `-` or `@` is a formula to whichever spreadsheet opens the
export — on the machine of whoever downloads it, in the context of whoever
opened the file.

The reproduction was run on 2026-11-27 against the service alone, on
`127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is
Alice's token. Alice's seed order carries the memo `=zazzles-lab-marker`.

## INJECT-001 — `GET /internal/reports/trades-raw.csv`

The line (`apps/trading/src/reports/trades-raw.controller.ts`):

```ts
// INJECT-001 / CWE-1236: the memo is written to the CSV as it is; a cell that starts with = is a formula
row.o_memo ?? '',
```

```console
$ curl -s $URL/internal/reports/trades-raw.csv -H "authorization: Bearer $A"
id,symbol,side,price,quantity,fee,memo
1,BTC-USD,BUY,640000,10000000,640,=zazzles-lab-marker
3,BTC-USD,BUY,645000,5000000,323,=zazzles-lab-marker
8,SOL-USD,SELL,15200,100000000,152,
```

Two cells of the export are formulas: what was gained is code that runs when
the file is opened, written by nothing more than a memo.

**Counterpart 1 — `GET /internal/reports/trades.csv`.** The same export, every
cell text: a cell that begins like a formula is prefixed with an apostrophe.

```console
$ curl -s $URL/internal/reports/trades.csv -H "authorization: Bearer $A"
id,symbol,side,price,quantity,fee,memo
1,BTC-USD,BUY,6400.00,0.10000000,6.40,'=zazzles-lab-marker
3,BTC-USD,BUY,6450.00,0.05000000,3.23,'=zazzles-lab-marker
8,SOL-USD,SELL,152.00,1.00000000,1.52,
```

**Counterpart 2 — `GET /internal/reports/trades.json`.** JSON, an attachment:
nothing parses a JSON string as a formula.

```console
$ curl -s -D - -o trades.json $URL/internal/reports/trades.json -H "authorization: Bearer $A" | grep -iE 'content-type|content-disposition'
content-type: application/json; charset=utf-8
content-disposition: attachment; filename="trades.json"
$ head -c 120 trades.json
{"trades":[{"id":"1","symbol":"BTC-USD","side":"BUY","price":"6400.00","quantity":"0.10000000","fee":"6.40","memo":"=zazzles-lab-marker"}...
```

The memo is still the same string — as data, not as a cell.

## The tests

`apps/trading/test/scenarios/exports.int-spec.ts` — one payload, sent to the
raw export and to both counterparts. The exploit assertion names what was
gained (a formula cell); the counterpart assertions name why it is refused.
The Postman collection `postman/trading/` carries one request in its `INJECT`
folder.

## Scope of the counterparts

Each counterpart claim is scoped: this export, carrying this memo, writes text.
Nothing here says any export is secure in general.
