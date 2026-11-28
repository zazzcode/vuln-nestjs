# `REDIR` — open redirect

One weakness of the edge of the `gateway`: its post-sign-in redirect takes the caller wherever the link's `next` parameter points, on the strength of an address the caller trusts. Two routes take them only where the operator listed, in `apps/gateway/src/redirects/continue.controller.ts`.

The reproduction was run on 2026-11-27 against the gateway alone on `127.0.0.1:4400`, with stand-ins for the three subgraphs. `$A` is Alice's token. Each counterpart's claim is scoped: this route, receiving the identical `next`, lands the caller where it says. Nothing here says any endpoint is secure in general.

<a id="redir-001"></a>
## REDIR-001 — the post-sign-in redirect follows `next` wherever it points

<a id="redir-001-agent"></a>
### REDIR-001 — agent reference

- **Source:** `apps/gateway/src/redirects/redirect.controller.ts` — `reply.redirect(next)` with the caller's `next`.
- **Operation:** `GET /api/v1/auth/redirect?next=…`, REST, a signed-in user.
- **Sink:** the `location` header of a 302 the edge itself signs.
- **Flow:** a link or a page the attacker controls carries `?next=http://127.0.0.1:4010/landing`; the caller, signed in, is redirected off-site by the lab's own address.
- **Counterparts:** `apps/gateway/src/redirects/continue.controller.ts` — `continue` (a fixed relative path), `continue-allowlisted` (an origin in `REDIRECT_ORIGINS`).
- **Tests:** `apps/gateway/test/scenarios/edge.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-edge.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-601 on the redirect controller. A report on the two counterpart routes for this CWE is a false positive.

<a id="redir-001-student"></a>
### REDIR-001 — student guide

An open redirect borrows the trust a user has in an address: the link begins
with the lab's own origin, the answer is a 302 from that origin, and the
`location` is whatever the caller's link put there. Nothing of the lab is
compromised — the caller simply lands somewhere no operator listed, which is
why phishing loves it: the visible URL is right up to the moment the browser
follows the header. The weak route reads `next` and hands it to
`reply.redirect` unchanged; neither counterpart reads an unlisted target.

<a id="redir-001-exploit"></a>
### REDIR-001 — exploit lab

```console
$ curl -s -D - -o /dev/null -H "authorization: Bearer $A" \
    'http://127.0.0.1:4400/api/v1/auth/redirect?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding'
HTTP/1.1 302 Found
…
location: http://127.0.0.1:4010/landing
```

The observation that proves exploitation: the edge answers 302 to
`http://127.0.0.1:4010/landing`, an origin no operator listed, carrying only
what the link carried. The same `next` through the counterparts:

```console
$ curl -s -D - -o /dev/null -H "authorization: Bearer $A" \
    'http://127.0.0.1:4400/api/v1/auth/continue?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding'
location: /api/v1/status

$ curl -s -D - -o /dev/null -H "authorization: Bearer $A" \
    'http://127.0.0.1:4400/api/v1/auth/continue-allowlisted?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding'
location: /api/v1/status
```

In Postman: `GET {{gatewayUrl}}/api/v1/auth/redirect?next={{accountsUrl}}/internal/health`
with Alice's bearer token — the client follows the redirect, and the answer
it lands on is the accounts service's own health page: an origin no operator
listed, reached on the edge's signature. In Burp: `next=http://127.0.0.1:4010/landing`
from Repeater, and read the `location` header the edge answers.

<a id="redir-001-safe"></a>
### REDIR-001 — vulnerable and protected

| | What it does with the same `next` | Why that holds |
| --- | --- | --- |
| `redirect` (vulnerable) | Redirects to it, wherever it points | `next` is the target, unchecked |
| `continue` (protected) | Redirects to `/api/v1/status`, always | A fixed relative path cannot name another origin, so the same `next` is not read at all |
| `continue-allowlisted` (protected) | Redirects to `next` only when its origin is in `REDIRECT_ORIGINS`; else to the fixed path | `http://127.0.0.1:4010` is not in the list, so the caller lands on the fixed path |

**Scoped claim.** Each counterpart defeats this flaw for identical input: the
`next` that carries the caller off-site on the first route lands them on the
edge's own status page on the other two. The claim is not that the allowlist
makes every redirect safe; only that this unlisted target is not followed.

<a id="redir-001-tests"></a>
### REDIR-001 — tests

`apps/gateway/test/scenarios/edge.int-spec.ts`: one test sends
`next=http://127.0.0.1:4010/landing` to the weak route and asserts the 302's
`location` is exactly that off-site origin — what was gained; two tests send
the same `next` to the counterparts and assert both answer 302 to
`/api/v1/status` and never to `4010` — why each was refused.

`tests/e2e/scenarios-edge.e2e-spec.ts` makes the same three proofs against the whole lab. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries three requests: `REDIR-001 the redirect follows next wherever it points`, `REDIR-001 continue redirects to a fixed relative path` and `REDIR-001 continue-allowlisted does not follow an unlisted origin`.
