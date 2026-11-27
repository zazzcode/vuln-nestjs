# `DESER` — a caller's string run as code

**Family:** `DESER` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A03

Two places treat a caller's string as something to execute: the smart
alert's expression is run with `eval` when the prices arrive, and the
announcement send compiles the body as an `ejs` template before it reaches
the notifier's command line. Everywhere else a caller's string is stored,
compared or rendered as data.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| DESER-002 | `createSmartAlert(expression: String!)` | `eval(alert.expression)` at evaluation | CWE-95 |
| DESER-003 | `POST /internal/announcements/send` | `ejs.render(input.body, …)` | CWE-1336 |

This service carries the `ejs` pin (3.1.6, [SCA-004](dependencies.md)): the
version itself is a finding for the dependency scanner, beside the code-level
flaw below.

## DESER-002 — an alert expression that is code

### DESER-002 — agent reference

- **Scenario:** DESER-002, a user expression run with `eval`.
- **Source:** `apps/notifications/src/alerts/smart-alert.evaluation.ts`
- **Operation:** `createSmartAlert(expression: String!)`, GraphQL, any user; the expression runs later, in `evaluateAlerts(prices)`.
- **Sink:** `eval(alert.expression)`, with the alert's row in scope.
- **Flow:** `args.expression → stored on the alert → AlertEvaluationService.evaluate → evaluateExpression → eval(alert.expression)`.
- **Counterparts:** `apps/notifications/src/alerts/create-alert.resolver.ts` (a structured alert, the string its label), `apps/notifications/src/alerts/create-rule-alert.resolver.ts` (a rule, the string its symbol).
- **Tests:** `apps/notifications/test/scenarios/deser.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report a stored caller string reaching `eval`.

### DESER-002 — student guide

The line (`apps/notifications/src/alerts/smart-alert.evaluation.ts`):

```ts
return eval(alert.expression ?? 'false'); // DESER-002 / CWE-95: the stored expression is run as code, with the alert's row in scope
```

A smart alert is a good product idea: "tell me when *this* happens", in the
user's own words. The flaw is where those words run. The expression is
stored as it was given and, at evaluation, handed to `eval` — with the
alert's own row in scope, so the code the caller wrote can read and rewrite
the row it rides on, and its return value decides whether an alert fires.
The delivery follows, signed and recorded, for whatever the expression says
is true.

The author's belief: "it is the user's own alert, on their own row." But
`eval` runs in this service, with this service's reach: the row is only
what is nearest, not what is only. The expression decides deliveries, and
anything it can reach from the evaluation is its playground.

### DESER-002 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`, with
Alice's token in `$A` and an administrator's in `$T`.

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"mutation($e: String!) { createSmartAlert(expression: $e) { id label } }",
         "variables":{"e":"alert.label = \"zazzles-lab-marker\", true"}}'
{"data":{"createSmartAlert":{"id":"6","label":"smart alert"}}

$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' -H "authorization: Bearer $T" \
    -d '{"query":"mutation($p: [PriceInput!]!) { evaluateAlerts(prices: $p) { alertId } }",
         "variables":{"p":[{"symbol":"BTC-USD","price":"1000.00"}]}}
{"data":{"evaluateAlerts":[{"alertId":"6"}]}

$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"{ alerts { id label } }"}'
… { "id": "6", "label": "zazzles-lab-marker" }
```

The price crosses nothing — no structured rule fired — yet the alert
delivered, and the row's label is the marker: the stored string ran as code,
returned `true`, and rewrote the row it was stored on. In Postman: the
request `DESER-002: an alert expression that is code`. In Burp: send the
mutation and the evaluation from Repeater and read the alert back.

### DESER-002 — vulnerable and protected

| | Operation | What it does with the same string |
| --- | --- | --- |
| Vulnerable | `createSmartAlert(expression)` | Stores it and runs it with `eval` at evaluation, with the row in scope |
| Counterpart 1 | `createAlert(input)` | Stores it as the label; the comparison is a threshold and an operator, so nothing runs and nothing fires |
| Counterpart 2 | `createRuleAlert(rule)` | Stores it as the symbol; no price is quoted for it, so nothing fires — and the rule input has no property an expression could ride |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the string that ran as code through `createSmartAlert` is, for them, an
inert value in a typed field — the same bytes, never executed, no delivery.
The claim is not that any label is safe for any purpose; only that these
two inputs decide with a threshold and an operator.

### DESER-002 — tests

`apps/notifications/test/scenarios/deser.int-spec.ts`, describe `DESER-002:
an alert expression that is code`. One attacker value — `alert.label =
"zazzles-lab-marker", true` — is sent to all three operations, each
followed by `evaluateAlerts` with a price no structured rule crosses:

- **The exploit:** the smart alert delivers, and its stored label is
  `zazzles-lab-marker`: the string ran and rewrote the row.
- **Counterpart 1:** the label is the payload still, and no delivery was
  made.
- **Counterpart 2:** the payload is the symbol still, no delivery was made,
  and a rule carrying an `expression` property is refused at input
  coercion, by name.

## DESER-003 — an announcement body that is a template

### DESER-003 — agent reference

- **Scenario:** DESER-003, the announcement body compiled as a template.
- **Source:** `apps/notifications/src/announcements/announcements-send.controller.ts`
- **Operation:** `POST /internal/announcements/send` (gateway: `POST /api/v1/admin/announcements/send`), REST, administrator.
- **Sink:** `ejs.render(input.body, { user: settings, title })`.
- **Flow:** `body.body → AnnouncementsSendController.send → ejs.render(input.body) → the rendered text on the notifier's command line`.
- **Counterparts:** `apps/notifications/src/announcements/broadcast-announcement.resolver.ts` (a fixed template, the body as data), `apps/notifications/src/announcements/announcements-notify.controller.ts` (plain text, no engine).
- **Tests:** `apps/notifications/test/scenarios/deser.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report caller input compiled as a template.

### DESER-003 — student guide

The line (`apps/notifications/src/announcements/announcements-send.controller.ts`):

```ts
const rendered = ejs.render(input.body, { user: settings, title: input.title }); // DESER-003 / CWE-1336: the caller's body is compiled as a template, so its tags run
```

The send route wants each recipient's notice personalised, so it renders the
announcement's body — the caller's string — as the template, with the
recipient's settings as data. Template injection is code execution by
another door: whatever the template language can do, the caller can ask
for. `<%= 7*7 %>` renders `49`; the tags are not printed, they run, and
their output is what the recipient's record holds. The same engine, given a
*fixed* template with the body as data, prints the tags as text — which is
the whole difference between the two.

The author's belief: "rendering is formatting, and the body is an
administrator's field." A template compiled from input is input executed,
and an administrator's field is still caller input.

### DESER-003 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`, with an
administrator's token in `$T` and Alice's in `$A`.

```console
$ curl -s http://127.0.0.1:3103/internal/announcements/send -H "authorization: Bearer $T" \
    -H 'content-type: application/json' \
    -d '{"title":"Scheduled maintenance","body":"Scheduled maintenance at 02:00 UTC. <%= 7*7 %>"}'

$ curl -s http://127.0.0.1:3103/internal/deliveries -H "authorization: Bearer $A"
…
  "responseBody": "Scheduled maintenance\n\nScheduled maintenance at 02:00 UTC. 49\n→ http://127.0.0.1:4010/webhook/alice\n",
```

The record holds `49`, not `<%= 7*7 %>`: the body's tag was compiled and
its value delivered. In Postman: the request `DESER-003: an announcement
body that is a template`. In Burp: send the same POST from Repeater and
read the record.

### DESER-003 — vulnerable and protected

| | Operation | What it does with the same body |
| --- | --- | --- |
| Vulnerable | `POST /internal/announcements/send` | Compiles it as the template; its tags run and their value is what is sent |
| Counterpart 1 | `broadcastAnnouncement(input)` | Renders a fixed template with the body as data: the tags are printed as text |
| Counterpart 2 | `POST /internal/announcements/notify` | No engine at all: the notice is built in process and sent as plain text |

**Scoped claim.** Each counterpart defeats this flaw for identical input:
the body whose tags ran through the send is sent, by them, with its tags
intact as text — the same bytes, never compiled. The claim is not that
every template is safe; only that these two never compile the caller's
string.

### DESER-003 — tests

`apps/notifications/test/scenarios/deser.int-spec.ts`, describe `DESER-003:
an announcement body that is a template`. One attacker value — a body
ending in `<%= 7*7 %>` — is sent to all three operations:

- **The exploit:** the route answers `201` and the record's `responseBody`
  contains `49` and not `<%= 7*7 %>`.
- **Counterpart 1:** the record contains `<%= 7*7 %>` and not `49`.
- **Counterpart 2:** the receiver on 4010 was sent the notice with
  `<%= 7*7 %>` in it, as text.
