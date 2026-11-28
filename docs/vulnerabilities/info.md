# `INFO` — information exposure through logs

2 scenarios: `INFO-001` in `accounts`, `INFO-002` in `gateway`.

**In `accounts`.**

The legacy sign-in's logging in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults), with the lab's own output as the log to read.

**In `gateway`.**

One failure of the same dependency, answered three ways: returned in full by a public diagnostics page, masked by one ticker page, logged with a request id by the other. The reproduction was run on 2026-11-27 against the gateway alone on `127.0.0.1:4400`, with the trading service unreachable — the failure the three pages answer.

## INFO-001 — the password and the token reach the log

### INFO-001 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/sessions/token` |
| Sink | `logger.log(... password ... token)`, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` |
| Flow | the credentials of the request → a `Logger` call that interpolates the password and the token → both are in the service's output |
| Counterparts | `apps/accounts/src/auth/auth.resolver.ts` (`signIn` logs the user id only), `apps/accounts/src/auth/auth.controller.ts` (`typed`, behind an interceptor that redacts named fields) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-532, SAST |

### INFO-001 — student guide

A log line that carries the password and the token turns every reader of the log into the user. The legacy token route writes the email, the password and the issued token in one line.

### INFO-001 — exploit lab

```console
$ curl -s -o /dev/null $RELAY/internal/sessions/token -H 'content-type: application/json' \
    -d '{"email":"alice@vcx.exchange","password":"alice-lab-only"}'
```

The lab's output, one line of it:

```text
[Nest] … LOG [legacy sessions] token issued for alice@vcx.exchange with password alice-lab-only: eyJhbGciOiJIUzI1NiIs…
```

The password and the token, in clear text. The counterparts' lines for the same credentials:

```text
[sessions] sign-in attempted as alice@vcx.exchange
[sessions] sign-in answered
```

The email, and no more: `signIn` logs the identity, and the typed route's interceptor redacts the named fields on the way to the logger.

### INFO-001 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/sessions/token` (vulnerable) | The password and the issued token are interpolated into the log call |
| `signIn` (protected) | The log line carries the user id only, for the same credentials |
| `POST /internal/sessions/typed` (protected) | An interceptor redacts named fields before the logger sees the body |

### INFO-001 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `INFO-001`: the token route's log contains the password and the token; `signIn`'s contains neither; the typed route's contains the email and not the password.

## INFO-002 — the public diagnostics page answers a failure in full

### INFO-002 — agent reference

- **Source:** `apps/gateway/src/public-api/public-diagnostics.controller.ts` — the catch answers `{ error: message, stack }`.
- **Operation:** `GET /api/v1/public/diagnostics`, REST, public.
- **Sink:** the 503 body: why the dependency failed and the stack of the call that failed, to any caller.
- **Flow:** the trading service is unreachable → the ticker call fails → the diagnostics page answers the failure itself, message and stack.
- **Counterparts:** `apps/gateway/src/markets/ticker.service.ts` and `markets.controller.ts` — `GET /api/v1/markets/ticker` (one masked sentence), `GET /api/v1/partner/ticker` (a request id; the stack logged, not returned).
- **Documentation:** this module. **Tests:** `apps/gateway/test/scenarios/edge.int-spec.ts`.
- **Expected finding:** CWE-209 on the public diagnostics controller. A report on the two counterpart routes for this CWE is a false positive.

### INFO-002 — student guide

An error page is a debugging gift to the operator and a map to the attacker:
the message says why the call failed, and the stack says where — the frames
carry the file paths and the libraries of the process that failed. A
diagnostics page that reports a dependency's health as it was seen, with
nothing masked, hands both to anyone who asks, no credential needed. The two
ticker pages ask the same dependency the same question and answer the same
failure the way a public endpoint should: one sentence the operator chose,
with nothing of the failure in it — or that sentence plus a request id to
quote, the stack written to the log where the operator reads it.

### INFO-002 — exploit lab

The trading service is unreachable (its port points at a closed one, as the
tests arrange it):

```console
$ curl -s http://127.0.0.1:4400/api/v1/public/diagnostics
{"error":"trading is unreachable (The pending stream has been canceled (caused by: connect ECONNREFUSED 127.0.0.1:1))","stack":"ServiceUnavailableException: trading is unreachable (…)\n    at callService (/…/libs/http2/src/http2-client.service.ts:222:11)\n    at async PublicDiagnosticsController.diagnostics (/…/apps/gateway/src/public-api/public-diagnostics.controller.ts:25:15)\n    …"}
```

The observation that proves exploitation: the reason trading failed
(`connect ECONNREFUSED 127.0.0.1:1`) and the server's own frames — the
library, the file, the line — are in the answer to an unauthenticated GET.
The same failure through the counterparts:

```console
$ curl -s http://127.0.0.1:4400/api/v1/markets/ticker
{"message":"the ticker is unavailable","error":"Service Unavailable","statusCode":503}

$ curl -s -D - http://127.0.0.1:4400/api/v1/partner/ticker
HTTP/1.1 503 Service Unavailable
…
x-request-id: 28a6da0c-4afc-411f-96ec-f784ad312232
…
{"error":"the ticker is unavailable","requestId":"28a6da0c-4afc-411f-96ec-f784ad312232"}
```

And in the server's own output, not in any answer, the partner route's log
line: `request 28a6da0c-4afc-411f-96ec-f784ad312232: the ticker is
unavailable` followed by the stack. In Postman: `GET
{{gatewayUrl}}/api/v1/public/diagnostics` — with the lab up it answers the
dependency's own answer to anyone; stop the trading service and the same
request answers the message and the stack. In Burp: the same GET from
Repeater.

### INFO-002 — vulnerable and protected

| | What it does with the same failure | Why that holds |
| --- | --- | --- |
| `public/diagnostics` (vulnerable) | Answers it: the message and the stack, 503, to anyone | The catch returns the error as it was seen |
| `markets/ticker` (protected) | Answers one chosen sentence — nothing of the reason, no stack anywhere in the body | The failure is masked before the answer is built; there is no place in the sentence for the reason to appear |
| `partner/ticker` (protected) | Answers the same sentence plus a request id; the stack goes to the log | The handler catches, logs with the id, and returns only what it chose to say |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the
failure whose reason and stack cross on the first route answers one masked
sentence on the second, and one sentence with an id on the third. The claim is
not that either route hides every failure detail in general; only that this
failure's message and stack do not cross through them.

### INFO-002 — tests

`apps/gateway/test/scenarios/edge.int-spec.ts`, with the trading stand-in
replaced by a closed port: one test reads the diagnostics page and asserts
the reason (`trading is unreachable`) and the frames (` at `) are in the
answer — what was gained; one test reads `markets/ticker` and asserts the one
masked sentence with neither `unreachable` nor `stack` in the answer; one
test reads `partner/ticker` and asserts the sentence and a well-formed
request id, nothing of the failure in the answer, and the stack captured in
the server's log — why each was refused.
