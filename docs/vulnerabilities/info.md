# `INFO` — information exposure through logs

The legacy sign-in's logging in `accounts`. Reproductions run against the accounts relay, `RELAY` (`http://127.0.0.1:4111` on the builder's port set; `3201` on the defaults), with the lab's own output as the log to read.

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
