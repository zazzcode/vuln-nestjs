# `SSRF` — the service makes a request to an address the caller chose

**Family:** `SSRF` · **Service:** `notifications` · **Scanner:** SAST · **OWASP:** A10 · API7

Two operations take a URL from a caller and go there: the webhook try-out and
the alert import from a URL. Both are delivery conveniences, and both trust
the address. Every other outbound path in this service goes through the
outbound guard: the scheme must be `http` or `https`, the origin must be on
`WEBHOOK_ALLOWED_ORIGINS` (the loopback test receiver on `4010` by default),
the host must resolve to loopback, redirects are not followed, and the
timeout is five seconds.

| ID | The operation | The sink | CWE |
| --- | --- | --- | --- |
| SSRF-001 | `testWebhook(url: String!)` | `WebhookClientService.send` — a POST with no guard | CWE-918 |
| SSRF-003 | `POST /internal/alerts/fetch` | `WebhookClientService.read` — a GET whose answer is returned | CWE-918 |

## SSRF-001 — a webhook posted inside the lab

### SSRF-001 — agent reference

- **Scenario:** SSRF-001, a webhook posted to any URL.
- **Source:** `apps/notifications/src/webhooks/test-webhook.resolver.ts`
- **Operation:** `testWebhook(url: String!)`, GraphQL, any user.
- **Sink:** `WebhookClientService.send(url, payload)` — `node-fetch`, `redirect: 'follow'`, no outbound guard.
- **Flow:** `args.url → TestWebhookResolver.test → DeliveryService.deliverToUnchecked → client.send → fetch(url, { method: 'POST' })`.
- **Counterparts:** `apps/notifications/src/settings/set-webhook-url.resolver.ts` (refused at save time), `apps/notifications/src/settings/register-webhook.resolver.ts` (saved, refused at delivery time by `evaluateAlerts`).
- **Tests:** `apps/notifications/test/scenarios/ssrf.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report the caller-controlled URL reaching a network request.

### SSRF-001 — student guide

The line (`apps/notifications/src/webhooks/test-webhook.resolver.ts`):

```ts
// SSRF-001 / CWE-918: the caller's URL is delivered to with no outbound guard,
// so an address inside the lab is reached from inside the machine.
const record = await this.deliveries.deliverToUnchecked(
  { alertId: null, userId: caller, url },
  { event: 'webhook-test', url },
);
```

`testWebhook` exists to try a webhook out before saving it, so it takes the
whole URL from the caller. `deliverToUnchecked` is the client's unguarded
path: whatever the string says, the service POSTs to it — including
addresses no outside client could reach, like another service's
`/internal/*` routes, which are protected by network position, not by
tokens. The service's own view of the machine is the prize: the gateway
(3000), the accounts and trading listeners (3101, 3102) and their relays
(3201, 3202) all answer a request this service sends. The delivery record
even returns the answer's body, so the response of an internal endpoint
comes back to the caller.

The author's belief: "it is the user's own webhook, on their own machine —
they could curl it anyway." The difference is position: the request is made
from inside the lab, so it reaches listeners that bind loopback for the lab
alone, and it carries the service's identity, not the user's.

### SSRF-001 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103` (the lab's
default notifications port), with Alice's token in `$A`. The address
`127.0.0.1:4310` is a one-line listener standing in for another service's
internal endpoint; in the whole lab, any `/internal/*` address that is not
on the webhook allowlist plays the same role.

```console
$ curl -s http://127.0.0.1:3103/graphql -H 'content-type: application/json' -H "authorization: Bearer $A" \
    -d '{"query":"mutation($url: String!) { testWebhook(url: $url) { status attempts } }",
         "variables":{"url":"http://127.0.0.1:4310/internal/health"}}'
{"data":{"testWebhook":{"status":"DELIVERED","attempts":1}}}

$ curl -s http://127.0.0.1:3103/internal/deliveries -H "authorization: Bearer $A"
...
  "url": "http://127.0.0.1:4310/internal/health",
  "status": "DELIVERED",
  "attempts": 1,
  "responseBody": "{\"status\":\"ok\",\"service\":\"stand-in\",\"marker\":\"zazzles-lab-marker\"}",
```

The internal endpoint answered, and its body — the marker `zazzles-lab-marker`
— came back to the caller in the delivery record. The stand-in listener
observed the POST arrive. In Postman: the request `SSRF-001: a webhook posted
inside the lab` in the notifications collection, with `url` pointed at an
address the allowlist does not name. In Burp: send the same GraphQL mutation
to the gateway's `/api/v1/graphql` from Repeater and read `responseBody` in
the answer.

### SSRF-001 — vulnerable and protected

| | Operation | What it does with the same URL |
| --- | --- | --- |
| Vulnerable | `testWebhook(url)` | POSTs to it with no check; the answer's body lands in the delivery record |
| Counterpart 1 | `setWebhookUrl(url)` | The outbound guard decides at save time: `BAD_USER_INPUT`, `refused: the origin … is not on the webhook allowlist`, and nothing is saved |
| Counterpart 2 | `registerWebhook(url)` then `evaluateAlerts(prices)` | The string is saved as given; when a delivery is made the guard refuses it, the record is `FAILED` with the reason in `lastError`, and nothing is sent |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the
allowlist comparison happens before any connection is opened, so the URL that
reached the internal endpoint through `testWebhook` is refused — at the save
in the first, at the delivery in the second. Neither claim is wider than
that: they say nothing about URLs already on the allowlist.

### SSRF-001 — tests

`apps/notifications/test/scenarios/ssrf.int-spec.ts`, describe
`SSRF-001: a webhook posted to any URL`. One attacker value — the stand-in's
`/internal/health` — is sent to all three operations:

- **The exploit:** `testWebhook` answers `DELIVERED` with `attempts` 1, the
  stand-in saw the POST to `/internal/health`, and the record's
  `responseBody` holds `zazzles-lab-marker`.
- **Counterpart 1:** `setWebhookUrl` answers `BAD_USER_INPUT` with a message
  naming the allowlist, and `User.webhookUrl` still reads the seeded
  `http://127.0.0.1:4010/webhook/alice`.
- **Counterpart 2:** `registerWebhook` saves the URL; `evaluateAlerts`
  records the delivery `FAILED`, `lastError` names the allowlist, and the
  stand-in received nothing.

A fourth test proves the guarded client follows no redirect (AC5), so the
unguarded twin's `redirect: 'follow'` is a difference a scanner can see.

## SSRF-003 — a URL fetched and its body returned

### SSRF-003 — agent reference

- **Scenario:** SSRF-003, a URL fetched and the response returned.
- **Source:** `apps/notifications/src/alerts/alerts-fetch.controller.ts`
- **Operation:** `POST /internal/alerts/fetch` (gateway: `POST /api/v1/alerts/fetch`), REST, any user.
- **Sink:** `WebhookClientService.read(url)` — a GET with no outbound guard, whose status and body are returned to the caller.
- **Flow:** `body.url → AlertsFetchController.fetch → client.read → fetch(url, { method: 'GET' }) → { status, body } returned`.
- **Counterparts:** `apps/notifications/src/alerts/alerts-import.controller.ts` (takes the content, fetches nothing), `apps/notifications/src/alerts/alerts-import-url.controller.ts` (fetches through the outbound guard).
- **Tests:** `apps/notifications/test/scenarios/ssrf.int-spec.ts`.
- **Expected finding:** yes. A SAST tool must report the caller-controlled URL reaching a network request whose response is returned.

### SSRF-003 — student guide

The line (`apps/notifications/src/alerts/alerts-fetch.controller.ts`):

```ts
// SSRF-003 / CWE-918: the caller's URL is fetched with no outbound guard and the
// answer is returned, so an internal endpoint can be read from inside the machine.
const attempt = await this.client.read(body.url);
```

The convenience is real: "give me the URL of your exported alerts and I will
import them". The flaw is that the fetch and the import were split: this
route only reads, and it hands the caller what came back — status and body —
with no guard in between. Where SSRF-001 lets a caller *touch* an internal
endpoint, this one lets them *read* it: any `/internal/*` answer that carries
state comes back as JSON in the response.

The author's belief: "reading is harmless; the importing route is the one
that needs care." But the read is the whole attack: internal endpoints answer
internal callers, and this route makes the service one and returns the page.

### SSRF-003 — exploit lab

Run on 2026-11-27 against the service alone on `127.0.0.1:3103`, with Alice's
token in `$A`. The payload URL is the service's own internal health endpoint —
an address no outside route exposes.

```console
$ curl -s http://127.0.0.1:3103/internal/alerts/fetch -H "authorization: Bearer $A" \
    -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:3103/internal/health"}'
{"status":200,"body":"{\"status\":\"ok\",\"service\":\"notifications\",\"store\":{\"engine\":\"sqlite\",\"connected\":true}}"}
```

The internal endpoint's answer — service name, store engine, connection
state — was returned to the caller. In Postman: the request
`SSRF-003: a URL fetched and read` in the notifications collection. In Burp:
send the same POST to the gateway's `/api/v1/alerts/fetch` from Repeater and
read the `body` field.

### SSRF-003 — vulnerable and protected

| | Operation | What it does with the same URL |
| --- | --- | --- |
| Vulnerable | `POST /internal/alerts/fetch` | GETs it with no check and returns the status and body |
| Counterpart 1 | `POST /internal/alerts/import` | Takes the content (`json`), fetches nothing; the URL string is not an alert document, so `400` `the value is not an alert document` |
| Counterpart 2 | `POST /internal/alerts/import-url` | Fetches through the outbound guard: `400` `refused: the origin … is not on the webhook allowlist`, nothing requested |

**Scoped claim.** Each counterpart defeats this flaw for identical input: no
request leaves the service for a URL the allowlist does not name — the first
because no request is ever made, the second because the guard refuses the
origin before the fetch. Neither says the import is safe for every content.

### SSRF-003 — tests

`apps/notifications/test/scenarios/ssrf.int-spec.ts`, describe
`SSRF-003: a URL fetched and its body returned`. One attacker value — the
stand-in's `/internal/health`, whose body carries `zazzles-lab-marker` — is
sent to all three routes:

- **The exploit:** the route answers `200` with the stand-in's status and
  its marker body, and the stand-in saw the GET.
- **Counterpart 1:** `/internal/alerts/import` answers `400`, the message
  says the value is not an alert document, and the stand-in received nothing.
- **Counterpart 2:** `/internal/alerts/import-url` answers `400` with the
  allowlist reason, and the stand-in received nothing.
