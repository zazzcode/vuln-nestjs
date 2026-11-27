# `COOKIE` — cookie attributes

The session cookies of the legacy sign-in routes in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

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
