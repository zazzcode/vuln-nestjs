# `CONFIG` — security misconfiguration

The edge of the `gateway`. Its default configuration is strong: `@fastify/helmet` on every answer, no CORS, guarded pages. A small part of it is deliberately weaker. The public scope under `/api/v1/public`, a Fastify scope registered by prefix, as a small part of an application ends up with weaker settings than the rest, serves its pages with no security headers and answers CORS for any origin; two open pages serve the API document and a debug report to anyone. Each weakness has its protected counterparts elsewhere in the gateway, in `apps/gateway/src/markets/markets.controller.ts`, `apps/gateway/src/lab/lab.controller.ts`, `apps/gateway/src/status/status.controller.ts`, `apps/gateway/src/openapi/openapi.controller.ts` and `apps/gateway/src/diagnostics/diagnostics.controller.ts`.

The reproductions were run on 2026-11-27 against the gateway alone on `127.0.0.1:4400`, with stand-ins for the three subgraphs. Each counterpart's claim is scoped: this route, receiving the identical request, refuses it for the reason given. Nothing here says any endpoint is secure in general.

<a id="config-001"></a>
## CONFIG-001 — CORS reflects any origin, with credentials

<a id="config-001-agent"></a>
### CONFIG-001 — agent reference

- **Source:** `apps/gateway/src/edge/edge.ts` — the public scope's hook: `access-control-allow-origin` is set to the request's `Origin`.
- **Operation:** `GET /api/v1/public/ticker`.
- **Sink:** the browser's same-origin policy: the reflected header plus `Access-Control-Allow-Credentials: true` lets any site read the answer in a signed-in browser.
- **Flow:** a page on `http://127.0.0.1:4020` fetches the ticker with `credentials: 'include'`; the edge echoes its origin; the browser hands the answer over.
- **Counterparts:** `apps/gateway/src/markets/markets.controller.ts` (no CORS at all), the same file's partner route (a static allowlist).
- **Tests:** `apps/gateway/test/scenarios/config.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-config.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-942 on `edge.ts`. A report on the two counterpart controllers for this CWE is a false positive.

<a id="config-001-student"></a>
### CONFIG-001 — student guide

CORS with `origin: true` and `credentials: true` is the combination that
reflects whatever origin the caller presented and allows authenticated reads.
A browser that has a session with the lab will attach its credentials to a
cross-site fetch marked `credentials: 'include'`; with the origin echoed back
and credentials allowed in the answer, the page doing the fetching — a page
the attacker controls — reads the response body. The whole attack is one
`fetch` call on another loopback origin.

<a id="config-001-exploit"></a>
### CONFIG-001 — exploit lab

```console
$ curl -s -D - -o /dev/null -H 'Origin: http://127.0.0.1:4020' http://127.0.0.1:4400/api/v1/public/ticker
HTTP/1.1 200 OK
access-control-allow-origin: http://127.0.0.1:4020
access-control-allow-credentials: true

$ curl -s -D - -o /dev/null -H 'Origin: http://127.0.0.1:4020' http://127.0.0.1:4400/api/v1/markets/ticker
HTTP/1.1 200 OK

$ curl -s -D - -o /dev/null -H 'Origin: http://127.0.0.1:4020' http://127.0.0.1:4400/api/v1/partner/ticker
HTTP/1.1 200 OK
```

The observation that proves exploitation: an origin no operator listed
(`http://127.0.0.1:4020` is not in `PARTNER_ORIGINS`) is echoed back with
credentials allowed on the public scope — and the same header sent to the two
counterparts returns no CORS header at all. In Postman: `GET
{{gatewayUrl}}/api/v1/public/ticker` with an `Origin` header. In Burp: add
`Origin: http://127.0.0.1:4020` to any request to the public scope and read
the response headers.

<a id="config-001-safe"></a>
### CONFIG-001 — vulnerable and protected

The public scope reflects; the counterparts refuse by two different
techniques. The markets ticker serves no CORS header at all, so the browser
refuses the cross-origin read whatever the page does — the absence of the
mechanism is the control. The partner ticker serves CORS only for origins in
`PARTNER_ORIGINS`: an origin not in the list is not echoed, so the browser
refuses that origin's read. Each claim is scoped: this input, this route, this
refusal.

**Scoped claim.** Each counterpart defeats this flaw for identical input: the origin `http://127.0.0.1:4020`, sent with the same request, is answered with no CORS header at all by the markets ticker and is not echoed by the partner ticker, so a browser refuses the cross-origin read that the public scope allows. The claim is not that the two routes are harmless to call from any page; only that this origin's page cannot read their answers.

<a id="config-001-tests"></a>
### CONFIG-001 — tests

`apps/gateway/test/scenarios/config.int-spec.ts`: one test sends `Origin:
http://127.0.0.1:4020` to the public ticker and asserts the echo and
`credentials: true`; one sends the preflight and asserts it is answered for
any header the site names; two send the identical request to each counterpart
and assert no CORS header is present.

`tests/e2e/scenarios-config.e2e-spec.ts` makes the same proofs against the whole lab. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries two requests: `CONFIG-001 the public ticker echoes any origin, with credentials` and `CONFIG-001 the markets ticker answers no CORS header at all`.

<a id="config-002"></a>
## CONFIG-002 — no security headers on the public scope

<a id="config-002-agent"></a>
### CONFIG-002 — agent reference

- **Source:** `apps/gateway/src/edge/edge.ts` — the public scope's hook removes every header the default scope sets; `apps/gateway/src/public-api/public-status.controller.ts` serves the page from that scope.
- **Operation:** `GET /api/v1/public/status`.
- **Sink:** the browser's document policy: no CSP, no `nosniff`, no frame options on an HTML answer.
- **Flow:** the scope's hook strips the headers helmet set; the page reaches a browser with nothing that constrains what may be done with it.
- **Counterparts:** `apps/gateway/src/lab/lab.controller.ts` (helmet's headers), `apps/gateway/src/status/status.controller.ts` (the same three headers set by hand).
- **Tests:** `apps/gateway/test/scenarios/config.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-config.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-693 on `edge.ts`. A report on the two counterpart controllers for this CWE is a false positive.

<a id="config-002-student"></a>
### CONFIG-002 — student guide

Security headers are the browser's part of the edge's defence: a
content-security-policy keeps injected script from running, `nosniff` keeps a
document from being read as another type, frame options keep the page out of a
frame someone else draws. The default scope of this gateway sets all of them
through `@fastify/helmet`; the public scope registers a hook that removes
them by prefix. An HTML answer from the public scope carries none — which is
also what its sibling XSS-003 leans on.

<a id="config-002-exploit"></a>
### CONFIG-002 — exploit lab

```console
$ curl -s -D - -o /dev/null http://127.0.0.1:4400/api/v1/public/status
HTTP/1.1 200 OK

$ curl -s -D - -o /dev/null http://127.0.0.1:4400/api/v1/status
HTTP/1.1 200 OK
content-security-policy: default-src 'self'
x-content-type-options: nosniff
x-frame-options: DENY
```

The observation that proves exploitation: the same status page, served from
the public scope, carries none of the three headers; served from the default
scope it carries all three. In Postman: two `GET`s, `{{gatewayUrl}}/api/v1/public/status`
and `{{gatewayUrl}}/api/v1/status`, comparing response headers.

<a id="config-002-safe"></a>
### CONFIG-002 — vulnerable and protected

The default scope's helmet answers carry the headers; the status page sets
the same three by hand, so the page carries them whatever the rest of the
scope does. Each claim is scoped to this page and these headers: it says
nothing about pages served from neither scope.

**Scoped claim.** Each counterpart defeats this flaw for identical input: the same unauthenticated GET that the public scope answers with no CSP, no `nosniff` and no frame options is answered by health with helmet's headers and by the default scope's status page with the same three set by hand. The claim is not that a security header removes every weakness a page may have; only that these headers are on these two answers.

<a id="config-002-tests"></a>
### CONFIG-002 — tests

`apps/gateway/test/scenarios/config.int-spec.ts`: one test reads the public
status page and asserts CSP, `nosniff` and frame options are all absent; two
read the counterparts and assert the headers each one carries (helmet's set
on health, the hand-set values on the status page).

`tests/e2e/scenarios-config.e2e-spec.ts` makes the same proofs against the whole lab. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries two requests: `CONFIG-002 the public status page carries no security headers` and `CONFIG-002 the default status page sets the security headers`.

<a id="config-003"></a>
## CONFIG-003 — the API document served with no authentication

<a id="config-003-agent"></a>
### CONFIG-003 — agent reference

- **Source:** `apps/gateway/src/api-docs/docs.controller.ts` — both routes are `@Public()`.
- **Operation:** `GET /docs`, `GET /docs/json`.
- **Sink:** the OpenAPI document: every route, method and schema the edge carries.
- **Flow:** no token is asked; the whole surface is read in one request.
- **Counterparts:** `apps/gateway/src/openapi/openapi.controller.ts` (the administrator's copy, and the service token's).
- **Tests:** `apps/gateway/test/scenarios/config.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-config.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-200 on the docs controller. A report on the guarded copies for this CWE is a false positive.

<a id="config-003-student"></a>
### CONFIG-003 — student guide

An API document is a map: it tells an attacker which routes exist, which are
administrative, what each one takes. Most deployments serve it to the
developers who need it, not to anyone who asks. This lab serves its document
three ways: open, to an administrator, and to the system's own calls. The open
copy is the flaw; the two guarded copies are its counterparts, and they hold
exactly the same document.

<a id="config-003-exploit"></a>
### CONFIG-003 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/docs
<!DOCTYPE html>…

$ curl -s http://127.0.0.1:4400/docs/json
{"openapi":"3.0.0","paths":{"/api/v1/health":{…},"/api/v1/lab/reset":{…},"/api/v1/status":{…},…

$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4400/api/v1/admin/openapi.json
401
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4400/api/v1/openapi.json
401
```

The observation that proves exploitation: the whole API surface is read with
no credential at all, while the identical document behind each guarded route
answers 401 to the same caller. In Postman: `GET {{gatewayUrl}}/docs/json`
with no header, then the same path with and without `{{adminToken}}` /
`{{internalToken}}` on the guarded copies.

<a id="config-003-safe"></a>
### CONFIG-003 — vulnerable and protected

The administrator copy refuses a caller without the `ADMIN` role (401, then
403 for a signed-in non-administrator); the service-token copy refuses any
call without the run's `x-internal-token`. The document is the same bytes;
what differs is who may read it. Scoped claims: these routes, this document.

**Scoped claim.** Each counterpart defeats this flaw for identical input: the same request with no credential that reads the whole API document from `/docs` is answered 401 by each guarded copy, which holds the same document. The claim is not that a guarded document reveals nothing to whoever may read it; only that a caller without the role or the service token does not read it.

<a id="config-003-tests"></a>
### CONFIG-003 — tests

`apps/gateway/test/scenarios/config.int-spec.ts`: one test reads both open
pages with no token and asserts the document's paths include administrative
routes; two tests read each guarded copy without a credential (401) and with
the right one (200, same paths).

`tests/e2e/scenarios-config.e2e-spec.ts` makes the same proofs against the whole lab. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries two requests: `CONFIG-003 the API document is served with no authentication` and `CONFIG-003 the guarded copy of the API document answers 401 without a token`.

<a id="config-004"></a>
## CONFIG-004 — a debug endpoint answers the environment and the versions

<a id="config-004-agent"></a>
### CONFIG-004 — agent reference

- **Source:** `apps/gateway/src/debug/debug.controller.ts` — `{ ...process.env }` is returned.
- **Operation:** `GET /api/v1/debug`.
- **Sink:** the JSON body: every environment value of the process, and the exact dependency versions.
- **Flow:** no token; the run's own secrets (`JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`) and the dependency list are read in one request.
- **Counterparts:** `apps/gateway/src/lab/lab.controller.ts` (a status, nothing else), `apps/gateway/src/diagnostics/diagnostics.controller.ts` (allowlisted keys, administrator only).
- **Tests:** `apps/gateway/test/scenarios/config.int-spec.ts` (the gateway alone, against stand-ins) and `tests/e2e/scenarios-config.e2e-spec.ts` (the whole lab).
- **Expected finding:** CWE-215 on the debug controller. A report on the two counterparts for this CWE is a false positive.

<a id="config-004-student"></a>
### CONFIG-004 — student guide

A debug page is a convenience that answers everything at once: the process's
environment (secrets included), its versions, its dependencies. For a lab that
regenerates its secrets per run the exposure is bounded — for anything real it
is the fastest foothold there is: one request returns the signing secret and
the exact version list to look a known weakness up in. The debug page here is
open on purpose; the two counterparts answer a status and an allowlisted,
guarded report.

<a id="config-004-exploit"></a>
### CONFIG-004 — exploit lab

```console
$ curl -s http://127.0.0.1:4400/api/v1/debug
{"service":"gateway","pid":53157,"node":"v24.21.0","platform":"darwin","environment":{"NODE":"/…/bin/node","INIT_CWD":"/…/gateway/apps/gateway","TERM":"dumb","SHELL":"/bin/zsh","TMPDIR":"/var/…",…,"JWT_SECRET":"<the run's signing secret>","INTERNAL_SERVICE_TOKEN":"<the run's service token>"…},"versions":{…},"dependencies":{"@apollo/gateway":"2.14.5","fastify":"5.12.8",…}}

$ curl -s http://127.0.0.1:4400/api/v1/health
{"status":"ok","services":{…}}
```

The observation that proves exploitation: the run's own `JWT_SECRET` and
`INTERNAL_SERVICE_TOKEN` are in the answer to an unauthenticated GET — the
values are regenerated for every run of the lab, which is what makes the
marker harmless — next to the exact dependency versions. The health answer,
the same request shape, carries a status and nothing else. In Postman: `GET
{{gatewayUrl}}/api/v1/debug` and read `environment.JWT_SECRET`.

<a id="config-004-safe"></a>
### CONFIG-004 — vulnerable and protected

Health answers a status: there is no place in its shape for an environment
value or a version to appear. The diagnostics page is an administrator's (401
without the role) and reads only the keys on its allowlist — a key that is not
listed is never read, so its value cannot leave the process. Scoped claims,
both.

**Scoped claim.** Each counterpart defeats this flaw for identical input: the same unauthenticated GET that reads the environment and the versions from the debug page is answered by health with a status alone, and by the diagnostics page with a refusal, 401, to a caller without the role; to an administrator it reads only its allowlisted keys, so the run's secrets are in neither answer. The claim is not that neither route can expose anything; only that these values do not cross through them.

<a id="config-004-tests"></a>
### CONFIG-004 — tests

`apps/gateway/test/scenarios/config.int-spec.ts`: one test reads the debug
page with no token and asserts `environment.JWT_SECRET` equals the run's
secret and the dependency versions are present; two tests read the
counterparts and assert the secret appears in neither (by shape for health,
by guard and allowlist for diagnostics).

`tests/e2e/scenarios-config.e2e-spec.ts` makes the same proofs against the whole lab. The collection `postman/gateway/vuln-nestjs.gateway.postman_collection.json` carries two requests: `CONFIG-004 the debug page answers the environment and the versions` and `CONFIG-004 health answers a status and nothing else`.
