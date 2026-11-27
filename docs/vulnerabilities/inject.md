# `INJECT` — injection into documents and logs

2 scenarios: `INJECT-001` in `trading`, `INJECT-002` in `notifications`.

`INJECT-001` is documented in [`trading-inject.md`](trading-inject.md), where trading's builder wrote it; this module holds the notifications scenario of the family.

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
[Nest] 86257  -  11/27/2026, 6:10:08 PM    LOG [alert-label] {"record":"alert-label","label":"BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok"}
[Nest] 86257  -  11/27/2026, 6:10:08 PM    LOG [AlertsService] alert created: {"label":"BTC above 70k\n[admin] creditWallet u-bob amount=1000.00 status=ok","symbol":"ETH-USD","threshold":"2900.00"}
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
