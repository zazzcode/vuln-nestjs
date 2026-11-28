# `INJECT` — injection into documents and logs

Two weaknesses that write a caller's string into something a machine parses. An order's memo is written into a CSV as it is, so a spreadsheet opens it as a formula (`trading`); an alert label is written into a log line as it is, so a newline in it forges a line of the caller's (`notifications`). The protected counterparts carry the same string as data: one writes text, one answers JSON, one logs the label encoded inside a value on one line, one makes it a field of a structured record.

The `trading` reproduction was run on 2026-11-27 against the service alone on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`, with Alice's token in `$A`; the `notifications` one the same day, against the service alone on `127.0.0.1:3103`, with `$A` Alice's token. Each counterpart's claim is scoped: this operation, receiving the identical input, keeps the string data for the reason given. Nothing here says any export or log is secure in general.

<a id="inject-001"></a>
## INJECT-001 — spreadsheet-formula injection in a CSV export

<a id="inject-001-agent"></a>
### INJECT-001 — agent reference

- **Service:** `trading`.
- **Source:** `apps/trading/src/reports/trades-raw.controller.ts`
- **Operation:** `GET /internal/reports/trades-raw.csv`, REST, a signed-in user.
- **Sink:** `row.o_memo ?? ''`: the memo written to the CSV as it is.
- **Flow:** an order's `memo` → the CSV cell written as it is → `=zazzles-lab-marker` stays a formula.
- **Counterparts:** `apps/trading/src/reports/reports.controller.ts`: `GET /internal/reports/trades.csv` (every cell text: a cell that begins like a formula is prefixed with an apostrophe), `GET /internal/reports/trades.json` (JSON, an attachment).
- **Tests:** `apps/trading/test/scenarios/exports.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller text written into a spreadsheet cell as it is: CWE-1236.

<a id="inject-001-student"></a>
### INJECT-001 — student guide

An order's `memo` is free text. Written to a CSV as it is, a memo that begins with `=`, `+`, `-` or `@` is a formula to whichever spreadsheet opens the export: on the machine of whoever downloads it, in the context of whoever opened the file. Nothing in the export says the cell is text, so the spreadsheet does not either.

The line (`apps/trading/src/reports/trades-raw.controller.ts`):

```ts
// INJECT-001 / CWE-1236: the memo is written to the CSV as it is; a cell that starts with = is a formula
row.o_memo ?? '',
```

<a id="inject-001-exploit"></a>
### INJECT-001 — exploit lab

The reproduction was run on 2026-11-27 against the service alone, on `127.0.0.1:4202`, through the HTTP/1.1 relay on `127.0.0.1:4212`. `$A` is Alice's token. Alice's seed order carries the memo `=zazzles-lab-marker`.

```console
$ curl -s $URL/internal/reports/trades-raw.csv -H "authorization: Bearer $A"
id,symbol,side,price,quantity,fee,memo
1,BTC-USD,BUY,640000,10000000,640,=zazzles-lab-marker
3,BTC-USD,BUY,645000,5000000,323,=zazzles-lab-marker
8,SOL-USD,SELL,15200,100000000,152,
```

Two cells of the export are formulas: what was gained is code that runs when the file is opened, written by nothing more than a memo. The same memo through the counterparts. `GET /internal/reports/trades.csv`, the same export with every cell text:

```console
$ curl -s $URL/internal/reports/trades.csv -H "authorization: Bearer $A"
id,symbol,side,price,quantity,fee,memo
1,BTC-USD,BUY,6400.00,0.10000000,6.40,'=zazzles-lab-marker
3,BTC-USD,BUY,6450.00,0.05000000,3.23,'=zazzles-lab-marker
8,SOL-USD,SELL,152.00,1.00000000,1.52,
```

`GET /internal/reports/trades.json`, JSON and an attachment: nothing parses a JSON string as a formula.

```console
$ curl -s -D - -o trades.json $URL/internal/reports/trades.json -H "authorization: Bearer $A" | grep -iE 'content-type|content-disposition'
content-type: application/json; charset=utf-8
content-disposition: attachment; filename="trades.json"
$ head -c 120 trades.json
{"trades":[{"id":"1","symbol":"BTC-USD","side":"BUY","price":"6400.00","quantity":"0.10000000","fee":"6.40","memo":"=zazzles-lab-marker"}...
```

The memo is still the same string — as data, not as a cell.

<a id="inject-001-safe"></a>
### INJECT-001 — vulnerable and protected

| | Operation | What it does with the same memo |
| --- | --- | --- |
| Vulnerable | `GET /internal/reports/trades-raw.csv` | Writes it into the CSV as it is: a cell that begins with `=` is a formula to the spreadsheet that opens the file |
| Counterpart 1 | `GET /internal/reports/trades.csv` | Writes every cell as text: a cell that begins like a formula is prefixed with an apostrophe |
| Counterpart 2 | `GET /internal/reports/trades.json` | Answers JSON, as an attachment: nothing parses a JSON string as a formula |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the memo that reaches the first export as a formula reaches the second as text, the apostrophe first, and the third as a value inside a JSON document. The claim is not that an apostrophe or a JSON answer is harmless in every reader; only that this memo opens as no formula through them.

<a id="inject-001-tests"></a>
### INJECT-001 — tests

`apps/trading/test/scenarios/exports.int-spec.ts`, describe `INJECT-001 — trades-raw.csv writes the memo as it is`. One payload — Alice's seed order, whose memo is `=zazzles-lab-marker` — read through the three exports:

- **The exploit:** the raw export's cell is `=zazzles-lab-marker`, with no apostrophe before it.
- **Counterpart 1:** the CSV writes the same memo as text, an apostrophe first.
- **Counterpart 2:** the JSON export answers `application/json`, as an attachment, with the memo as it was sent.

The collection `postman/trading/vuln-nestjs.trading.postman_collection.json` carries the request `INJECT-001 the raw export writes the memo as a formula`.

<a id="inject-002"></a>
## INJECT-002 — a label that forges a log line

<a id="inject-002-agent"></a>
### INJECT-002 — agent reference

- **Scenario:** INJECT-002, log injection through an alert label.
- **Source:** `apps/notifications/src/alerts/create-labeled-alert.resolver.ts`
- **Operation:** GraphQL `createLabeledAlert(label: String!, symbol: String!, direction: AlertDirection!, threshold: Decimal!)`, user.
- **Sink:** `Logger.log("label accepted: " + label)` — the label is interpolated into the log message as it was given.
- **Flow:** `label` with a newline → the logger receives one message of two physical lines → the second line reads as an action the application never took.
- **Counterparts:** `apps/notifications/src/alerts/create-alert.resolver.ts` (the label is logged JSON-encoded, on one line), `apps/notifications/src/alerts/label-record.interceptor.ts` (the label is a field of one structured record).
- **Tests:** `apps/notifications/test/scenarios/inject.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller text concatenated into a log message unencoded.

<a id="inject-002-student"></a>
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

<a id="inject-002-exploit"></a>
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

<a id="inject-002-safe"></a>
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

<a id="inject-002-tests"></a>
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

The collection `postman/notifications/vuln-nestjs.notifications.postman_collection.json` carries two requests: `INJECT-002: a label that forges a log line` and `INJECT-002: the counterpart carries the same label as data`.
