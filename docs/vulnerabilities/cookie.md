# `COOKIE` — cookie attributes

3 scenarios: `COOKIE-001` in `accounts`, `COOKIE-002` in `accounts`, `COOKIE-003` in `gateway`.

**In `accounts`.**

The session cookies of the legacy sign-in routes in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

**In `gateway`.**

The preference change a browser can drive on its own: one route takes the session cookie as the caller and a form's body as the request, and asks for no token beyond the cookie — everything a page on another site can arrange, nothing it cannot. The reproduction was run on 2026-11-27 against the gateway alone on `127.0.0.1:4400`, with stand-ins for the three subgraphs. `$A` is Alice's token.

## COOKIE-001 — the token cookie is set without `HttpOnly`

### COOKIE-001 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/sessions/token` |
| Sink | `set-cookie` with the access token and no `HttpOnly`, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` |
| Flow | sign-in → the token itself is the cookie's value, readable by any script on the page |
| Counterparts | `apps/accounts/src/auth/auth.controller.ts` (`typed` sets `HttpOnly`, `SameSite=Strict`; `signed` sets a signed, `HttpOnly`, `SameSite=Lax` cookie) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-1004, SAST |

### COOKIE-001 — student guide

A cookie without `HttpOnly` is part of the document's JavaScript world: one injected script reads it and the session leaves with it. The legacy token route sets the raw JWT as the cookie and marks nothing.

### COOKIE-001 — exploit lab

```console
$ curl -s -i $RELAY/internal/sessions/token -H 'content-type: application/json' \
    -d '{"email":"alice@vcx.exchange","password":"alice-lab-only"}' | grep -i '^set-cookie'
set-cookie: vcx_session=eyJhbGciOiJIUzI1NiIs…; Path=/; SameSite=Lax
```

No `HttpOnly`, and the value is the access token itself. The counterparts, same credentials:

```console
set-cookie: vcx_session=eyJ…; Path=/; HttpOnly; SameSite=Strict      (typed)
set-cookie: vcx_session=eyJ….KeqP3N+…; Path=/; HttpOnly; SameSite=Lax (signed: a signed value)
```

### COOKIE-001 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/sessions/token` (vulnerable) | The access token is the cookie, with no `HttpOnly` to keep it from scripts |
| `POST /internal/sessions/typed` (protected) | `HttpOnly` and `SameSite=Strict` on the same cookie name, for these credentials |
| `POST /internal/sessions/signed` (protected) | A signed cookie value, `HttpOnly`, `SameSite=Lax`: the token is not even the value |

### COOKIE-001 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `COOKIE-001`: the token route's cookie has no `HttpOnly`; both counterparts set it, with `SameSite` set too.

## COOKIE-002 — the remember cookie lives thirty days with no `SameSite`

### COOKIE-002 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/sessions/remember` |
| Sink | `max-age` 30 days and no `SameSite`, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` |
| Flow | the "remember me" sign-in sets a month-long cookie any site's request carries |
| Counterparts | `apps/accounts/src/auth/auth.controller.ts` (`typed`: `SameSite=Strict`, a session cookie; `signed`: `SameSite=Lax`) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-1275, SAST |

### COOKIE-002 — student guide

A cookie with no `SameSite` rides on every cross-site request, whatever site triggered it. Thirty days of that is a long window for a CSRF-shaped request to carry a session its user knows nothing about.

### COOKIE-002 — exploit lab

```console
$ curl -s -i $RELAY/internal/sessions/remember -H 'content-type: application/json' \
    -d '{"email":"alice@vcx.exchange","password":"alice-lab-only"}' | grep -i '^set-cookie'
set-cookie: vcx_session=eyJhbGciOiJIUzI1NiIs…; Max-Age=2592000; Path=/
```

`Max-Age=2592000` (thirty days), and no `SameSite` attribute at all. The counterparts answer cookies with `SameSite=Strict` and `SameSite=Lax` respectively, and neither outlives the session.

### COOKIE-002 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/sessions/remember` (vulnerable) | A month-long cookie with no `SameSite`: every site's request carries it |
| `POST /internal/sessions/typed` (protected) | `SameSite=Strict`, a session cookie, for the same credentials |
| `POST /internal/sessions/signed` (protected) | `SameSite=Lax`, signed, also a session cookie |

### COOKIE-002 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `COOKIE-002`: the remember cookie matches `max-age=2592000` and carries no `SameSite`; both counterparts set `SameSite`.

## COOKIE-003 — a preference change a cross-site form can submit

### COOKIE-003 — agent reference

- **Source:** `apps/gateway/src/profile/cookie-preferences.controller.ts` — cookie authentication, a form body accepted, no CSRF token.
- **Operation:** `POST /api/v1/profile/preferences`, REST, a signed-in user's session cookie.
- **Sink:** the state change carried to `PUT /internal/profile` on nothing but the cookie a browser attaches.
- **Flow:** a page on another origin posts a form to the edge; the browser adds `vcx_session`; the preference changes without the user's page sending anything else.
- **Counterparts:** `apps/gateway/src/profile/preferences.controller.ts` — `preferences/json` (a bearer header and a JSON body), `preferences/csrf` (the `x-csrf-token` header, through `@fastify/csrf-protection`).
- **Documentation:** this module. **Tests:** `apps/gateway/test/scenarios/edge.int-spec.ts`.
- **Expected finding:** CWE-352 on the cookie preferences controller. A report on the two counterpart routes for this CWE is a false positive.

### COOKIE-003 — student guide

A cookie is sent by the browser on every request to the edge, whatever page
asked for the request — that is what makes it authentication a cross-site
page can borrow. A state change that accepts the cookie as its caller, a form
body, and no second token is a state change any page on another origin can
submit: the browser does the sending, the edge cannot tell the two apart.
CSRF is defeated by asking for one thing the other page cannot supply — a
header a form does not carry, or a token the other page never saw — and both
counterparts here do exactly that.

### COOKIE-003 — exploit lab

The form a page on another origin submits, sent as curl — `displayName` is a
field the profile accepts, so the change is written (the answer is the
stand-in's echo of what reached the service; in the whole lab it is what
`accounts` answers to the same carried request):

```console
$ curl -s -i -X POST -H "cookie: vcx_session=$A" -H 'content-type: application/x-www-form-urlencoded' \
    --data 'displayName=Cross-site+change' http://127.0.0.1:4400/api/v1/profile/preferences
HTTP/1.1 200 OK
…
{"echoed":true,"service":"accounts","reached":{"method":"PUT","path":"/internal/profile","protocol":"2.0","headers":{…,"cookie":"vcx_session=eyJ…",…},"body":{"displayName":"Cross-site change"}}}
```

The observation that proves exploitation: the change crossed to the profile —
`PUT /internal/profile`, the form's `displayName` in the body, the session
cookie as the caller — driven by nothing a page on another site cannot send.
The same form through the counterparts:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "cookie: vcx_session=$A" \
    -H 'content-type: application/x-www-form-urlencoded' --data 'displayName=Cross-site+change' \
    http://127.0.0.1:4400/api/v1/profile/preferences/json
401

$ curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "authorization: Bearer $A" \
    -H 'content-type: application/x-www-form-urlencoded' --data 'displayName=Cross-site+change' \
    http://127.0.0.1:4400/api/v1/profile/preferences/json
415

$ curl -s -i -X POST -H "cookie: vcx_session=$A" -H 'content-type: application/x-www-form-urlencoded' \
    --data 'displayName=Cross-site+change' http://127.0.0.1:4400/api/v1/profile/preferences/csrf
HTTP/1.1 403 Forbidden
…
Missing csrf secret
```

In Postman: `POST {{gatewayUrl}}/api/v1/profile/preferences` with the cookie
header and the form body, and read the 200. In Burp: the same POST from
Repeater, or — closer to the flaw — a local page whose form posts to the
edge, with the browser holding the cookie.

### COOKIE-003 — vulnerable and protected

| | What it does with the same form | Why that holds |
| --- | --- | --- |
| `preferences` (vulnerable) | Carries it to the profile on the cookie alone | Everything the request is — cookie caller, form body, no token — is what a cross-site page can arrange |
| `preferences/json` (protected) | Refuses it twice: no bearer header (401), and a form body is not `application/json` (415) | A cross-site form sends neither: a custom header it cannot add, and a JSON content type it does not have |
| `preferences/csrf` (protected) | Refuses it 403 before anything is carried | The `x-csrf-token` the edge demands is issued with the caller's own cookie (`GET …/preferences/csrf`); a page on another origin never saw it |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the
form that changes the preference on the first route is answered 401 and 415 on
the second and 403 on the third, and nothing reaches the profile. The claim
is not that either route resists every forged request; only that this
cross-site form, with nothing but the cookie, does not pass them.

### COOKIE-003 — tests

`apps/gateway/test/scenarios/edge.int-spec.ts`: one test posts the form with
the session cookie and asserts `PUT /internal/profile` was reached with the
form's `displayName` and the cookie — what was gained; one test posts the
same form to `preferences/json` with no bearer header (401) and with a bearer
header but the form body (415); one test posts it to `preferences/csrf` and
asserts the 403 and that nothing more reached the service — why each was
refused.
