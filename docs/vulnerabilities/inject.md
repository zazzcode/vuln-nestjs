# `INJECT` — injection into documents and logs

2 scenarios: `INJECT-001` in `trading`, `INJECT-002` in `notifications`.

`INJECT-002` is the notifications scenario of the family; `INJECT-001`, trading's, follows at the end of the module.

**In `notifications`.**

**Family:** `INJECT` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A09

An alert's label is free text, and one of the ways of creating an alert
writes it into a log line as it is. A newline in the label ends the log's
line and starts one of the caller's own, formatted like every real line
around it. The two protected ways to record a label carry it as data: one
encodes it inside a JSON value on one line, the other makes it a field of a
structured record.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| INJECT-002 | GraphQL `createLabeledAlert(label: String!, …)` | `` this.logger.log(`label accepted: ${label}`) ``, the label unencoded in the message | CWE-117 |

## INJECT-002 — a label that forges a log line

### INJECT-002 — agent reference

- **Scenario:** INJECT-002, log injection through an alert label.
- **Source:** `apps/notifications/src/alerts/create-labeled-alert.resolver.ts`
- **Operation:** GraphQL `createLabeledAlert(label: String!, symbol: String!, direction: AlertDirection!, threshold: Decimal!)`, user.
- **Sink:** `Logger.log("label accepted: " + label)` — the label is interpolated into the log message as it was given.
- **Flow:** `label` with a newline → the logger receives one message of two physical lines → the second line reads as an action the application never took.
- **Counterparts:** `apps/notifications/src/alerts/create-alert.resolver.ts` (the label is logged JSON-encoded, on one line), `apps/notifications/src/alerts/label-record.interceptor.ts` (the label is a field of one structured record).
- **Tests:** `apps/notifications/test/scenarios/inject.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller text concatenated into a log message unencoded.

### INJECT-002 — student guide

The line (`apps/notifications/src/alerts/create-labeled-alert.resolver.ts`):

```ts
this.logger.log(`label accepted: ${label}`); // INJECT-002 / CWE-117: the label is written into the log line as it was given, so a newline in it forges a line that reads like the application's own
```

A log is read a line at a time: by a person skimming it, by a collector
that parses it, by alerts that match it. The logger was given one message,
but the message carries what the caller wrote, and a newline in it ends the
line the logger started and begins one the caller authored. The forged line
carries the same timestamp machinery and the same context format as every
real line, so nothing in it says it is data: `[admin] creditWallet u-bob
amount=1000.00 status=ok` reads as an administrator's action that never
happened — a defacement of the audit trail, or a step social-engineering a
operator who greps the log. The author's belief: "the label is the
caller's own text, and logs are only for us."

### INJECT-002 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`. `$A` is
Alice's token. The label is `BTC above 70k`, a newline, and the forged
action:

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' \
    -H "authorization: Bearer $A" \
    -d '{"query":"mutation { createLabeledAlert(label: \"BTC above 70k\\n[admin] creditWallet u-bob amount=1000.00 status=ok\", symbol: \"BTC-USD\", direction: ABOVE, threshold: \"70000.00\") { id label } }"}'
{"data":{"createLabeledAlert":{"id":"6","label":"BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok"}}}
```

and the service's own log, immediately after:

```console
[Nest] 86257  -  11/27/2026, 6:10:01 PM    LOG [AlertLabels] label accepted: BTC above 70k
[admin] creditWallet u-bob amount=1000.00 status=ok
```

Two physical lines, one log call: the second is the caller's, wearing the
logger's format. The same label through the counterpart
(`createAlert(input: { …, label })`) produces this instead:

```console
[Nest] 25070  - 11/27/2026, 6:58:05 PM     LOG [alert-label] {"record":"alert-label","label":"BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok"}
[Nest] 25070  - 11/27/2026, 6:58:05 PM     LOG [AlertsService] alert created: {"label":"BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok","symbol":"BTC-USD","threshold":"70000.00"}
```

one line each: the newline is two characters inside a value, in the
interceptor's structured record and in the service's own line. In Postman:
the request `INJECT-002: a label that forges a log line`, which asserts the
label was stored as it was sent. In Burp: send the mutation from Repeater
and read the service's output.

### INJECT-002 — vulnerable and protected

| | Operation | What it does with the same label |
| --- | --- | --- |
| Vulnerable | `createLabeledAlert` | Writes it into the log message as it is: a newline in it starts a line of the caller's |
| Counterpart 1 | `createAlert` | Logs it JSON-encoded, on one line: the newline is two characters inside a value |
| Counterpart 2 | the `LabelRecordInterceptor` on `createAlert` | Records one structured line in which `label` is a field whose value is the payload, whatever it contains |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the label that becomes a second log line on the first cannot become one on
either of them, because both carry it inside a value no reader of the log
parses as a line. The claim is not that JSON-encoding makes every log
forgery impossible; only that this label cannot forge a line through them.

### INJECT-002 — tests

`apps/notifications/test/scenarios/inject.int-spec.ts`, describe `INJECT-002:
a label that forges a log line`. One attacker value — the label with its
newline and forged second line — is sent to the vulnerable operation and to
the counterpart, with the logger spied where the service runs:

- **The exploit:** exactly one message the logger received carries a raw
  newline, and its second physical line is `[admin] creditWallet u-bob
  amount=1000.00 status=ok`; the alert is stored with the label as it was
  sent.
- **Counterpart 1:** no message carries a raw newline, and the label
  travels JSON-encoded — the two characters `\n` where the payload had a
  line break.
- **Counterpart 2:** one structured record, on one line, in which `label`
  is a field whose value is the payload.

**In `trading`.**

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
