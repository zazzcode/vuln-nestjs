# The `gateway` service — Deliverable Specification

**Worktree / branch:** `vuln-nestjs-wt/gateway` / `phase-2d-gateway`
**Feature:** the services of VCX · **Milestone:** Step 2 of the implementation plan
**Deliverable:** the `gateway` service, finished: 13 scenarios, each built, with its test passing
**Project Owner / Deliverable Owner:** the Project Owner · **Drafted:** 2026-11-27
**Delivery topology:** single-deliverable branch · **Review artifact:** one draft pull request to `phase-1-foundation`
**Decomposition rationale:** the plan gives one service one builder, one branch and one pull request; sibling branches for the other services, because four builders work at once (ADR-010).
**Integration branch:** `phase-1-foundation` · **Merge policy:** PR review required — the agent commits and pushes this branch only
**Run log:** `.zazz/ephemeral/002d-gateway-run-log.md` · **Final report:** `.zazz/ephemeral/002d-gateway-report.md` (ignored by Git) · **Execution tracking:** none. The pull request is the record
**Implementation coordination:** one Contributor Agent, working alone · **Companion skills:** none
**Standards:** none adopted. `AGENTS.md` stands in for the index.

## 0. Capability

Builds the `gateway` of the lab as its [service specification](../project/services/gateway.md) describes: the federated graph over three subgraphs, the REST pass-through to the services' `/internal/*` paths, its own thirteen safe endpoints, and the edge's security middleware. Thirteen scenarios: eight vulnerable endpoints, four process-wide GraphQL settings, and one deployment-level setting whose counterpart is shared with the subgraphs. Each is built, has a test in both directions that passes (a setting's test asserts the exploit and records the hardened value), a documentation module with a reproduction that was run, a request in the gateway's Postman collection and a catalogue entry. The flaws are the product: none is fixed, and no safe operation claims more than it proves.

## 1. Required reading

- [AGENTS.md](../../AGENTS.md): the invariants, what a sub-agent may write, the commands.
- [gateway.md](../project/services/gateway.md): the whole contract. Sections 2, 3 and 4 for the graph, the scopes and the API; section 5 for the scenarios; section 6 for the markers.
- [accounts.md](../project/services/accounts.md), [trading.md](../project/services/trading.md), [notifications.md](../project/services/notifications.md): section 4 of each, the `/internal/*` contract the pass-through forwards to. Written from these, not from the other builders' code.
- [implementation-plan.md](../project/implementation-plan.md): section 3, "Order of work inside a service" and "What a service must show to be done".
- [security-model.md](../architecture/security-model.md): sections 3, 4 and 5. [testing-strategy.md](../architecture/testing-strategy.md): sections 2, 3 and 4.
- [ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md): the ratio, and that a counterpart outranks it.
- The skeleton under `apps/gateway/`, the exports of `libs/*` (each `src/index.ts`), and `apps/gateway/test/zz-spike.int-spec.ts`, a spike that is never committed as it is.

## 2. Invariants

The ten invariants of `AGENTS.md`, verbatim. Those this deliverable touches most:

- **INVARIANT 1 — never fix a vulnerable operation.** A test that proves a flaw stopped being exploitable is a regression.
- **INVARIANT 3 — a protected counterpart is a scoped claim:** "this pattern defeats this flaw for identical input", never "secure in general".
- **INVARIANT 4 — every vulnerable operation has a protected counterpart**, built with its test. A process-wide setting has instead its hardened value, recorded in the catalogue entry and the documentation.
- **INVARIANT 5 — the safety rails stay.** Loopback only, fake data, harmless markers (`zazzles-lab-marker`, `42`), no telemetry.
- **INVARIANT 9 — never document a command that has not been run.**
- **INVARIANT 10 — names in code stay neutral.** The vulnerable line carries the marker.

## 3. Scope

**Approved review shape:** one pull request. Alternative rejected: one branch per scenario family, which would put six branches in the way of one service's review.

**Strict scope constraint.** Every file this specification adds or changes is under `apps/gateway/`, `postman/gateway/`, `docs/vulnerabilities/{gql,config,redir,xss,cookie,info}.md` and this file. The gateway carries no dependency pin, so neither `pnpm-lock.yaml` nor `tests/expected-audit.json` changes. The spike `apps/gateway/test/zz-spike.int-spec.ts` is deleted when the stand-ins that replace it are committed.

| Path | New / modified | Reason |
| --- | --- | --- |
| `apps/gateway/src/**` | modified, new | The edge, the own endpoints, the pass-through, the graph's settings |
| `apps/gateway/test/**` | modified, new | The stand-ins and the service's tests |
| `postman/gateway/vuln-nestjs.gateway.postman_collection.json` | modified | One request per scenario, after the four skeleton requests |
| `docs/vulnerabilities/{gql,config,redir,xss,cookie,info}.md` | new | One module per family, this service's scenarios only. Named by family, not by service: `docs/vulnerabilities/index.md` fixes the model |
| `.zazz/ephemeral/002d-gateway-catalogue.json` | new, ignored | The 13 catalogue entries, for the lead agent |

**Out of scope:** `libs/`, `catalog/`, `tests/`, `scripts/`, the Postman environment, the other collections, `docs/vulnerabilities/index.md` and `dependencies.md`, every other service, `tests/e2e/`.

## 4. Decisions

- **D-1 — The pass-through forwards what it was given.** Method, path parameters, query, body and the `authorization` and `cookie` headers cross; the service token is added; the service's status, content type and body come back. The gateway validates nothing but the caller. Why: the contract says each pass-through controller "validates nothing more than the caller, forwards the request, and returns what the service answered".
- **D-2 — One controller per upstream feature, under `apps/gateway/src/passthrough/`.** `accounts/{auth,profile,documents,users,admin-users}`, `trading/{admin,wallets,orders,reports}`, `notifications/{webhooks,alerts,announcements,deliveries}`, exactly the modules the contract's table names. Why: the contract lists them.
- **D-3 — The edge is one Fastify plugin registered by `main.ts` and by the tests: `@fastify/helmet` at the root, and a `/api/v1/public` scope that strips the security headers and answers CORS for any origin, with credentials.** Why: the public scope undoes helmet's headers by prefix and writes its own CORS answer, which is how a small part of an application ends up weaker than the rest. The route scopes' rows of the contract stay testable: default routes carry helmet's headers and no CORS; public routes carry reflected CORS and no security headers. How the scope is registered differs from the first plan — an `onRequest` hook gated on the prefix, not a plugin with a prefix; section 13's change log records why.
- **D-4 — The four weak GraphQL settings sit in the gateway module's factory, each with its marker; the absence of a depth rule carries one too.** `introspection: true`, `graphiql: true`, `allowBatchedHttpRequests: true`, `includeStacktraceInErrorResponses: true`, and no `validationRules`. Why: they are process-wide settings with no twin (security-model section 5); the catalogue records each hardened value.
- **D-5 — GQL-007's gateway half is built: every subgraph fetch presents `x-internal-token`.** The other half — a subgraph that requires it on `_entities` and `_service` — is the lead's work in Step 3: trading and notifications require it, and accounts keeps answering any caller, because it is the scenario's vulnerable operation. The tests prove both halves against a stand-in that plays the subgraph: the exploit against a stand-in that requires nothing (accounts as it stays), the counterpart against one that requires the token. What each real subgraph does is in section 13.
- **D-6 — The OpenAPI document is built once by `SwaggerModule.createDocument` and served three ways:** `/docs` and `/docs/json` open (CONFIG-003), `/api/v1/admin/openapi.json` for an administrator, `/api/v1/openapi.json` for the service token. `/docs` is a small local HTML index page that links to `/docs/json`; no swagger-ui is served, because its assets come from a CDN and the lab fetches nothing outside the machine.
- **D-7 — `POST /api/v1/auth/sign-in` carries `@fastify/rate-limit`, ten a minute.** It is the Protected 2 of accounts' AUTH-003 and it lives at the edge, as the contract's "the rate limit on sign-in" says.
- **D-8 — Thirteen safe endpoints of its own are built, all thirteen the contract lists.** Why: twelve of them are counterparts; `GET /api/v1/admin/diagnostics` completes the count at thirteen. No safe operation is left out, so none is listed in section 13 as missing. The pass-through routes are counted in the three service specifications, not here.
- **D-9 — The stand-ins of the three subgraphs are one test helper, `apps/gateway/test/subgraphs.ts`, with fake data from `@zazzles/exchange-lab-data`.** It stands in for composition, federation queries, transports (HTTP/2 for `accounts` and `trading`, HTTP/1.1 for `notifications`), header forwarding, and the internal token requirement of GQL-007's counterpart. Why: the gateway cannot be tested on its own, and its end-to-end tests wait for Step 3.

## 5. Agent implementation rules

Work only in the worktree named above. Commit and push to `phase-2d-gateway` after each step; never merge, never commit to another branch. Run only this service's commands (`pnpm --filter @zazzles/exchange-gateway test`, `… test:int`) and the root's `pnpm lint`, `pnpm build`, `pnpm format:check`. Run `pnpm test:api` only with the port set 4400, 4401 to 4403, 4411, 4412. Nothing is left running at the end. Record each step in `.zazz/ephemeral/002d-gateway-run-log.md`.

**Halt conditions:** the service's own tests cannot be made to pass; a shared file blocks every scenario; a change is needed outside the scope above.

## 6. Acceptance criteria

- **AC1 — The graph.** With the three stand-ins up, `POST /graphql` answers a query whose fields come from all three services, over the transports they speak, with `authorization` and `cookie` forwarded and nothing else. Verified by `apps/gateway/test/graph.int-spec.ts`.
- **AC2 — Every safe endpoint of its own does what its row says.** The thirteen of section 7. Verified by `apps/gateway/test/safe.int-spec.ts`, one test per endpoint.
- **AC3 — The pass-through.** Every route of the three service specifications' REST tables exists, forwards method, path, query, body and the caller's headers, adds the service token, and returns the service's status and body. Verified by `apps/gateway/test/safe.int-spec.ts` through a stand-in service that echoes what reached it, one test per module and one per caller kind.
- **AC4 — Every scenario, in both directions where there is one.** The payload of section 8 goes to the vulnerable endpoint and to each protected counterpart. The exploit assertion names what was gained. The counterpart assertion names why it was refused. A setting's test asserts the exploit; its hardened value is in the catalogue entry and the documentation. Verified by the file the table names.
- **AC5 — The marker.** Each vulnerable endpoint's weak line carries `// <ID> / CWE-<n>: …`; each weak setting carries one. Verified by review of `git diff phase-1-foundation --stat`.
- **AC6 — Documentation and Postman.** Each scenario has a section with a reproduction that was run, and one request in the gateway collection whose script asserts what was gained. `pnpm test:api` passes on the port set above. Verified by that run.
- **AC7 — The catalogue.** `.zazz/ephemeral/002d-gateway-catalogue.json` holds 13 entries, valid against `catalog/catalog.schema.json`, whose `source`, `safeControl`, `safeControls`, `documentation` and `test` paths exist on the branch.
- **AC8 — Clean.** `pnpm lint`, `pnpm build`, `pnpm --filter @zazzles/exchange-gateway test`, `pnpm --filter @zazzles/exchange-gateway test:int` and `pnpm format:check` each exit 0. After a stop no listener and no temporary directory of this service remain.
- **AC9 — Scope.** `git diff phase-1-foundation --stat` lists only the paths of section 3.

## 7. Safe operations

**Built, thirteen of its own, from the contract's section 4.** `GET /api/v1/health` and `POST /api/v1/lab/reset` (kept from the skeleton), `GET /api/v1/status`, `GET /api/v1/status.json`, `GET /api/v1/markets/ticker`, `GET /api/v1/partner/ticker`, `GET /api/v1/admin/diagnostics`, `GET /api/v1/admin/openapi.json`, `GET /api/v1/openapi.json`, `GET /api/v1/auth/continue`, `GET /api/v1/auth/continue-allowlisted`, `POST /api/v1/profile/preferences/json`, `POST /api/v1/profile/preferences/csrf`. Twelve are counterparts named in section 8; `GET /api/v1/admin/diagnostics` completes the count. Beside them, the pass-through of D-2, and the sign-in rate limit of D-7.

**Tests.** `apps/gateway/test/safe.int-spec.ts`: the thirteen own endpoints, the pass-through through a stand-in, the route scopes (default: helmet, no CORS; public: CORS reflected, no security headers), the masked error and the request id, the rate limit.

## 8. The scenarios

Each row: the payload, sent as written to every operation in the row. "Refused" names the reason the test asserts. Harmless markers as the contract's section 6 lists them.

| ID | Operation | Payload and what is gained | Protected 1: why refused | Protected 2: why refused | Test |
| --- | --- | --- | --- | --- | --- |
| GQL-001 | `POST /graphql`, `GET /graphql` | `__schema { types { name } }` answers the whole graph; `GET` with `Accept: text/html` serves the GraphiQL IDE | hardened value: both `false` (a setting has no twin) | — | `test/scenarios/gql.int-spec.ts` |
| GQL-002 | `POST /graphql` | `me { orders { user { … } } }` nested 25 deep answers data | hardened value: a depth rule, limit 5 | — | `test/scenarios/gql.int-spec.ts` |
| GQL-003 | `POST /graphql` | An array of 3 operations is answered as an array: a brute force fits in one call | hardened value: `allowBatchedHttpRequests: false` | — | `test/scenarios/gql.int-spec.ts` |
| GQL-004 | `POST /graphql` | `{ me { nope } }` answers `extensions.stacktrace`, the server's stack | hardened value: `includeStacktraceInErrorResponses: false` | — | `test/scenarios/gql.int-spec.ts` |
| GQL-007 | `POST /graphql` (the setting) | A direct `_entities` call to the subgraph port reads `u-admin` by key, where `user(id)` is admin only | the subgraph requires `x-internal-token` on `_entities` and `_service`: a direct call without it is refused | the gateway presents the token, so the graph still answers | `test/scenarios/gql.int-spec.ts` |
| CONFIG-001 | `GET /api/v1/public/ticker` | `Origin: http://127.0.0.1:4020` is echoed with `Access-Control-Allow-Credentials: true` | `GET /api/v1/markets/ticker`: no CORS header at all | `GET /api/v1/partner/ticker`: the origin is not in `PARTNER_ORIGINS`, nothing is echoed | `test/scenarios/config.int-spec.ts` |
| CONFIG-002 | `GET /api/v1/public/status` | No CSP, no `nosniff`, no frame options on the answer | `GET /api/v1/health`: helmet's headers | `GET /api/v1/status`: the same, set by hand | `test/scenarios/config.int-spec.ts` |
| CONFIG-003 | `GET /docs`, `GET /docs/json` | No token: the whole API surface is read | `GET /api/v1/admin/openapi.json`: 401/403 without `ADMIN` | `GET /api/v1/openapi.json`: 401 without the service token | `test/scenarios/config.int-spec.ts` |
| CONFIG-004 | `GET /api/v1/debug` | `JWT_SECRET`'s presence, environment values, dependency versions | `GET /api/v1/health`: a status, nothing else | `GET /api/v1/admin/diagnostics`: allowlisted keys, 401/403 without `ADMIN` | `test/scenarios/config.int-spec.ts` |
| REDIR-001 | `GET /api/v1/auth/redirect?next=` | `next=http://127.0.0.1:4010/landing` redirects off-site, 302 | `GET /api/v1/auth/continue`: a fixed relative path | `GET /api/v1/auth/continue-allowlisted`: the origin is not in `REDIRECT_ORIGINS`, no redirect to it | `test/scenarios/edge.int-spec.ts` |
| XSS-003 | `GET /api/v1/public/status?name=` | `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">` is served unescaped, as `text/html` | `GET /api/v1/status`: the same marker escaped, CSP | `GET /api/v1/status.json`: JSON, `nosniff` | `test/scenarios/edge.int-spec.ts` |
| COOKIE-003 | `POST /api/v1/profile/preferences` | A form post with the session cookie, no CSRF token: the preference changes | `POST …/preferences/json`: no `Authorization` to send cross-site, and a form body is not `application/json` | `POST …/preferences/csrf`: `403`, no `x-csrf-token` | `test/scenarios/edge.int-spec.ts` |
| INFO-002 | `GET /api/v1/public/diagnostics` | An error's message and stack returned to the client | `GET /api/v1/markets/ticker`: masked, no stack | `GET /api/v1/partner/ticker`: a request id, the stack logged not returned | `test/scenarios/edge.int-spec.ts` |

Documentation: `docs/vulnerabilities/gql.md` (GQL-001 to GQL-004, GQL-007), `config.md` (CONFIG-001 to CONFIG-004), `redir.md`, `xss.md` (XSS-003 only), `cookie.md` (COOKIE-003 only), `info.md` (INFO-002 only). Postman: one folder per family in `postman/gateway/`, one request per scenario, after the four skeleton requests.

## 9. Execution sequence

1. This specification, committed first; push; open the draft pull request to `phase-1-foundation`.
2. The stand-ins (`test/subgraphs.ts`), replacing the spike; a round trip through the graph (AC1). Commit and push.
3. The edge plugin, the thirteen safe endpoints of its own, the pass-through controllers; `test/safe.int-spec.ts` (AC2, AC3). Commit and push in small groups. This step is finished and pushed before any vulnerable endpoint is written.
4. Family by family: the vulnerable endpoint, `test/scenarios/<family>.int-spec.ts`, the documentation module, the Postman requests. One scenario, one commit, one push (AC4, AC5, AC6).
5. The catalogue file (AC7), then everything of AC8 and AC9, the change log, the pull request's body, the report.

## 10. Open questions

None. The service specification settles the contract; where it is silent the decisions above apply and section 13 records what the build changed.

## 11. Run log protocol

`.zazz/ephemeral/002d-gateway-run-log.md`: append-only. Each line carries the time and what came of it: slices started, tests and checks with their exit codes, commits with their hash and their push.

## 12. Agent implementation prompt

```text
You are building the gateway service of vuln-nestjs, a deliberately vulnerable NestJS lab.
Worktree: /Users/michael/Dev/zazzcode/vuln-nestjs-wt/gateway — every command and file path is inside it.
Branch: phase-2d-gateway. Commit and push there only. Never merge.
Specification: .zazz/specifications/002d-gateway.md. Read it, then its section 1, and nothing else whole.
Tracking: none. Keep .zazz/ephemeral/002d-gateway-run-log.md current; .zazz/ephemeral/002d-gateway-report.md is your final report.
Work alone. Run only this service's tests, and pnpm lint, build, format:check.
Halt on: a change outside section 3; the service's tests that cannot pass.
Order: section 9. Verify each AC with what it cites. Then write the report.
```

## 13. Implementation and review changes

Built 2026-11-27. Thirteen scenarios, thirteen safe endpoints of its own, the pass-through and the graph, each with its test passing and its documentation and request. What differs from the plan above:

- **The base is `main`, not `phase-1-foundation`.** The lead brought the branch onto `main` three times during the build (`6d377ab`, `60adb5a`, `065a12c`), so the sibling services' files travel on the branch and the pull request is reviewed against `main`. Nothing of theirs is touched; the scope check is `git diff origin/main...HEAD --name-only`.
- **GQL-002's test walks twelve levels, not twenty-five.** The seed gives every user two orders, so a twenty-five-deep document fans out past the test worker's heap. Twelve already walks thousands of entities; the flaw — no limit at any depth — is the same, and the hardened value stays five. The documentation module says so where it shows the document.
- **GQL-007's subgraph half is the lead's, in Step 3.** First written here as: each real subgraph must require `x-internal-token` on `_entities` and `_service`, and refuse a call without it (403), while the gateway's fetches — composition included — present the token and so pass. Amended on 2026-11-28, before this branch merges: taken literally, no subgraph would answer a direct `_entities` call, and the flaw would live only in this branch's stand-in. As Step 3 builds it — its deliverable specification, `003-integration.md`, decision D-2, which reaches `main` with the integration pull request — trading and notifications require the token and refuse a call without it with 403; accounts keeps answering any caller, being the scenario's vulnerable operation, which the first invariant of `AGENTS.md` forbids removing. The gateway's half is built (`subgraph-data.source.ts`); the tests here prove both halves against stand-ins that play a subgraph that requires nothing and one that requires the token.
- **COOKIE-003's payload is a display name.** The specification's row says "a preference changes"; the real `PUT /internal/profile` of `accounts` carries a DTO whitelist (`forbidNonWhitelisted`), so a `theme` field is refused 400 end-to-end. The cross-site form posts `displayName=Cross site change` — a field the profile accepts, written on the cookie alone — and one payload is sent across the whole row, as section 8 requires.
- **An object body crosses as `application/json`.** `InternalClientService.forward` serializes a parsed body to JSON whatever content type the caller's own request carried; it now declares the JSON it sends, so a form the edge accepted is carried to the service as the JSON object the edge parsed (found end-to-end: accounts parsed the JSON body as a form under the caller's content type and refused it).
- **The collection's REDIR requests assert the landing, not the 302.** Newman follows redirects and the lead's runner does not switch that off, so the exploit request points `next` at the accounts service's own public health route — an origin no allowlist names — and its script asserts the answer it landed on is accounts'; the counterparts assert the caller landed on the edge's own status page. The dead-port marker (`http://127.0.0.1:4010/landing`) stays in the integration test and the documentation module. INFO-002's requests likewise assert what the running lab can show, with the failure path (message and stack) asserted by the integration test and shown in the module.
- **The public scope is an `onRequest` hook gated on the prefix, not a plugin registered with a prefix.** D-3 first planned a `/api/v1/public` plugin with a prefix answering CORS through `@fastify/cors`; observed on 2026-11-27, a plugin registered with a prefix does not reach the routes the root Fastify instance holds — and Nest's controllers register there — so its hooks never fire for them. The scope is instead a hook on the root instance that gates on the `/api/v1/public` prefix (`apps/gateway/src/edge/edge.ts`), with the three CORS headers written by hand. The contract's section 3 still describes the planned plugin shape; every behaviour its route-scope rows require is unchanged and tested in `apps/gateway/test/scenarios/config.int-spec.ts`. D-3 is amended above to point here.

---

*End of specification.*
