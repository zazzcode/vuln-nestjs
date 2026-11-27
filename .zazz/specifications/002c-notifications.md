# The `notifications` service — Deliverable Specification

**Worktree / branch:** `/Users/michael/Dev/zazzcode/vuln-nestjs-wt/notifications` / `phase-2c-notifications`
**Feature:** VCX, the deliberately vulnerable NestJS lab
**Milestone:** M2 — The services
**Deliverable:** Step 2c, the `notifications` service: price alerts, webhook deliveries and announcements
**Project Owner:** @zazzcode
**Deliverable Owner:** @zazzcode
**Delivery topology:** sibling branch. One of four cut from `phase-1-foundation` for Step 2, built in parallel because no service calls another
**Review artifact:** one PR for this specification
**Approved review shape:** one PR
**Decomposition rationale:** one PR, because the service is the unit the [implementation plan](../project/implementation-plan.md#3-step-2--the-services-in-parallel) reviews: "one sub-agent per service". Its safe operations are reviewed as ordinary code in their own commits, its vulnerable operations as labelled additions in later ones, so that a reviewer can read the two kinds separately without two pull requests. Sibling PRs per scenario family were rejected: every family shares the delivery record, the outbound guard and the fake data, so there is no seam that does not cut through a file
**Integration branch:** `phase-1-foundation` (named by the lead agent, from [OQ-5 of the scaffolding](001-foundation.md#10-open-questions): the four branches of Step 2 are cut from it and their pull requests target it)
**Merge policy:** PR review required. Agents commit and push the feature branch only. The Project Owner merges
**Drafted:** 2026-11-26
**Shared run log:** `.zazz/ephemeral/002c-notifications-run-log.md` (local only, ignored by Git)
**Execution tracking:** local run log only. `AGENTS.md` records that the repository has no work tracker
**Implementation coordination:** Lead Agent delegating one bounded deliverable to a Contributor Agent, which works alone inside this service's directory
**Companion skills for implementation:** N/A

**Greenlight.** The Project Owner approved the service's design on 2026-11-26 ([service specification](../project/services/notifications.md), status line) and the reduction of its safe routes the same day ([AGENTS.md, invariant 4](../../AGENTS.md)). The lead agent instructed this session to write this specification, commit it first, open the pull request as a draft and then work to the end, stopping only for a gap in the design or a shared change. That instruction is the approval to implement. What it resolved by default is in [§10](#10-open-questions), for the Project Owner to overrule in the pull request.

---

## 0. Capability

The `notifications` service, complete against its [service specification](../project/services/notifications.md): four tables in SQLite in memory with the fake data loaded at every start, the outbound guard, 22 safe operations and 9 vulnerable ones carrying 10 scenarios, each scenario with a test that sends one payload to the vulnerable operation and to each protected counterpart, one Postman request per scenario, one documentation module per scenario, and the three dependency pins the service carries (`node-fetch` 2.6.6, `ejs` 3.1.6, `dot-prop` 4.1.0), each reached by a test. It is started, tested and stopped on its own: no other service runs, and after it stops no listener and no temporary directory of its tests remains.

---

## 1. Required Reading For The Implementor

Read these before opening an editor. Section-pinned, not whole documents.

### 1.a This Specification

Read this specification end to end first.

### 1.b Feature / Milestone Context

- [`.zazz/project/services/notifications.md`](../project/services/notifications.md) — all of it. This is the contract for the API, and §1, §5 and §6 twice: the delivery flow, the outbound guard, the ten scenario rows and their markers.
- [`.zazz/project/implementation-plan.md`](../project/implementation-plan.md) — §1 (who does what), §3 (ownership, order of work, what a service must show to be done), §7 (conventions).
- [`.zazz/architecture/security-model.md`](../architecture/security-model.md) — §3 (safety rails), §4 (the functional baseline), §5 (how a deliberate flaw is added), §8 (running the lab safely).
- [`.zazz/architecture/testing-strategy.md`](../architecture/testing-strategy.md) — §2 (layers), §3 (scenario tests in both directions), §4 (Postman and Newman), §7 (definition of done).
- [`.zazz/architecture/service-communication.md`](../architecture/service-communication.md) — §5 (the internal REST contract), §6 (identity propagation), §7 (outbound: webhooks).
- [`.zazz/architecture/data-architecture.md`](../architecture/data-architecture.md) — §4 (data access), §6 (entities), §8 (the fake data), §10 (reset).
- [`.zazz/architecture/api-design.md`](../architecture/api-design.md) — §3 (conventions), §4 (adapter idioms), §5 (errors), §6 (the federated schema).
- [`.zazz/architecture/decisions/ADR-006-express-adapter-for-notifications.md`](../architecture/decisions/ADR-006-express-adapter-for-notifications.md) — whole. Why this service is on Express and which idioms it exists to show.
- [`.zazz/architecture/decisions/ADR-008-safe-baseline-then-deliberate-flaws.md`](../architecture/decisions/ADR-008-safe-baseline-then-deliberate-flaws.md), [`ADR-009-vulnerable-pins-one-workspace.md`](../architecture/decisions/ADR-009-vulnerable-pins-one-workspace.md), [`ADR-010-services-never-call-each-other.md`](../architecture/decisions/ADR-010-services-never-call-each-other.md) — whole. Short.
- [`.zazz/project/scenario-catalog.md`](../project/scenario-catalog.md) — the rows of this service's ten scenarios and three pins, and "Catalogue file schema".
- [`docs/vulnerabilities/dependencies.md`](../../docs/vulnerabilities/dependencies.md) — SCA-003, SCA-004, SCA-006 and "When the pins are installed".
- [`.zazz/project/requirements.md`](../project/requirements.md) — FR-5.1 to FR-5.5, FR-6.2, FR-7.5, FR-8.1 to FR-8.3, FR-8.6, FR-9.2, FR-9.4, NFR-1, NFR-2, NFR-4, NFR-5, NFR-8, NFR-11, NFR-12.

### 1.c Prior Specifications In This Delivery Effort

- [`001-foundation.md`](001-foundation.md) — §D-4 (the names of the test layers), §D-6 (guards and pipes are providers), §D-7 (fixed identifiers; reset recreates), §D-8 (reset needs the service token), §8 phase 3 (the skeleton each service starts from).

### 1.d Standards

This repository has no `standards/` directory and no `standards/index.yaml`. **None adopted.** [AGENTS.md](../../AGENTS.md) stands in for it: its invariants, its "Shared-file coordination" rule and its "Repo-specific rules" are the standards for this specification.

**Verification step before writing code:** re-read the invariants and the repo-specific rules of `AGENTS.md`. Four are restated in [§2](#2-invariants). One rule from [repository-layout §4](../architecture/repository-layout.md#4-conventions) is added here because it constrains every file name: no `vuln`, `unsafe` or `safe` in an identifier or a path.

### 1.e Existing Code References

- [`apps/notifications/src/announcements/`](../../apps/notifications/src/announcements/) — the feature module every other one copies: entity, model, repository, service, resolver, the service's unit test.
- [`apps/notifications/test/app.int-spec.ts`](../../apps/notifications/test/app.int-spec.ts) — how a test of this service starts it (the Express adapter, port 3103, secrets made for the run) and stops it.
- [`libs/testing/src/start.ts`](../../libs/testing/src/start.ts) — `startService`: what it proves about the stop, and that it creates the application without `main.ts`. Anything `main.ts` does alone is not under test; [D-8](#d-8--the-json-body-parser-is-a-nestjs-middleware-class-registered-in-a-module) follows from that.
- [`libs/internal-auth/src/`](../../libs/internal-auth/src/) — `Public`, `Roles`, `CurrentUser`, `UserId`, `graphContext`. `auth-guard.spec.ts` says which resolvers the global guard does not reach.
- [`libs/graphql/src/errors.ts`](../../libs/graphql/src/errors.ts) — how an `HttpException` status becomes `extensions.code`.
- [`tests/api/collections.ts`](../../tests/api/collections.ts) — `variablesIn` and `requestsIn`: the two checks every Postman request must pass without Newman.
- [`tests/e2e/outbound-watch.mjs`](../../tests/e2e/outbound-watch.mjs) — what the end-to-end suite counts as leaving this machine: a connection, or a name resolution, to anything but `127.0.0.1`, `::1` and `localhost`. A request that makes this service *resolve* another name fails the lead agent's suite.

### 1.f Project Orientation

- [`AGENTS.md`](../../AGENTS.md) — invariants, ownership of shared files, the repository commands, the rule about ports on a shared machine.
- [`docs/setup-and-testing.md`](../../docs/setup-and-testing.md) on the base branch — §6 and §8: which suite takes which ports, how the lab is moved to other ports, and the convention for a command that was run on other than the default ports.

---

## 2. Invariants

The ten invariants of `AGENTS.md` hold verbatim. Six are load-bearing for this step.

### INVARIANT 1 — Never "fix" a vulnerable operation

A test that proves a flaw stopped being exploitable is a regression: restore the flaw, do not weaken the test. The nine vulnerable operations of this service are built to be exploitable, and stay so.

### INVARIANT 2 — Never upgrade or remove a vulnerable dependency pin

`node-fetch` 2.6.6, `ejs` 3.1.6 and `dot-prop` 4.1.0, once installed, stay. The four advisories they bring are findings the dependency scanner must report.

### INVARIANT 3 — A protected counterpart is a scoped claim

"This pattern defeats this flaw for identical input". Never "secure in general". Every test, module and catalogue entry of this service says it that way.

### INVARIANT 4 — Every vulnerable operation has a protected counterpart, and about one and a half safe operations for every vulnerable one

[ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md), decided on 2026-11-27. The nine vulnerable operations have sixteen counterparts between them, and every one is built: where the counterparts alone are more than the ratio has room for, they are built and the ratio gives way, because the evidence for a scenario outranks the number. Of the safe operations that are no scenario's counterpart, only those a flow, a test or a scenario needs are built ([D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not)); six more of the service specification's 28 exist for the ratio alone and are not built. What is left out is recorded in [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not) and [§13](#13-implementation-and-review-change-log).

### INVARIANT 5 — Safety rails stay

Loopback only: the service on `127.0.0.1:3103`, and every listener a test starts on `127.0.0.1` by name. Fake data. Harmless markers: `zazzles-lab-marker`, `42`, arithmetic, a file a test creates under a temporary directory. No real credentials, no real file is read or written by an exploit, no request to a host that is not loopback, no name resolution that leaves this machine. No telemetry.

### INVARIANT 6 — Services never call each other

This service holds no client for another service. Its only outbound request is the webhook delivery, to a URL a caller saved or named, and its twins. A flow that needs two services is two calls made by the client.

Three rules from `AGENTS.md` that are not numbered invariants but bind every commit: names in code are neutral; generated ground truth is never hand-edited; a command is documented only after it has run.

---

## 3. Scope

### Approved Review Shape

This specification is approved for **one PR**. If implementation surfaces a need to split, stack or combine, stop for Deliverable Owner sign-off, update this section in place, and record the change in [§13](#13-implementation-and-review-change-log).

**Rationale.** See the header.

**Review units owned by this specification.**

- One PR, `phase-2c-notifications` against `phase-1-foundation`. Acceptance boundary: [§6](#6-acceptance-criteria). Evidence boundary: [§7](#7-test-strategy), the pull request body and the report `.zazz/ephemeral/002c-notifications-report.md`.
- Inside the PR, two kinds of commit, as the implementation plan asks: the safe operations first, so that they can be reviewed as ordinary code; then each family of vulnerable operations, with its tests, in its own commit.

### Strict Scope Constraint

Every file this change writes is under `apps/notifications/`, `postman/notifications/`, `docs/vulnerabilities/`, `.zazz/specifications/002c-notifications.md` or `.zazz/ephemeral/`. Two shared files change, each by a command and never by an edit: `pnpm-lock.yaml` and `tests/expected-audit.json`. If implementation surfaces a need to modify anything else, stop and surface it to the lead agent.

The branch was cut at `421d2a4`. Scope is checked from there, not from the tip of the base, which the lead agent keeps moving: `git diff --stat 421d2a4..HEAD`.

### In Scope

| Path | New / Modified | Reason |
| --- | --- | --- |
| `.zazz/specifications/002c-notifications.md` | New | This specification |
| `apps/notifications/package.json` | Modified | The three pins, exact |
| `apps/notifications/src/config/` | Modified | `WEBHOOK_ALLOWED_ORIGINS`; the type declaration of `dot-prop` |
| `apps/notifications/src/database/` | Modified | The four tables in the data source's entity list |
| `apps/notifications/src/seed/` | Modified | The fake data of every table |
| `apps/notifications/src/announcements/` | Modified, New | The existing query; the JSON answer, the page, the notice, the sends, the twin that serves raw HTML |
| `apps/notifications/src/alerts/` | New | Alerts, rules, the imports, the `User` fields, and four twins |
| `apps/notifications/src/settings/` | New | The webhook URL and the channels, and the twin that walks a path |
| `apps/notifications/src/webhooks/` | New | The outbound guard, the client, the delivery record, the preview, the evaluation, and two twins |
| `apps/notifications/src/app.module.ts` | Modified | Wires the modules |
| `apps/notifications/scripts/notify.js` | New | The notifier command the sends run |
| `apps/notifications/views/` | New | The fixed templates |
| `apps/notifications/test/` | New, Modified | The suites of [§7](#7-test-strategy) |
| `postman/notifications/vuln-nestjs.notifications.postman_collection.json` | Modified | One request per scenario |
| `docs/vulnerabilities/<scenario>.md`, ten files; `sca-003.md`, `sca-004.md`, `sca-006.md` | New | One module per scenario, and one per pin |
| `pnpm-lock.yaml` | Modified, by `pnpm add` | The pins |
| `tests/expected-audit.json` | Rewritten, by `pnpm audit:update` | The four advisories |
| `.zazz/ephemeral/002c-notifications-run-log.md`, `-catalogue.json`, `-report.md` | New, ignored | The run log, the catalogue entries for the lead agent to add, the report |

### Out Of Scope

- `catalog/catalog.json`. The lead agent adds this service's entries and re-snapshots. This branch delivers them in `.zazz/ephemeral/002c-notifications-catalogue.json`.
- `tests/expected-hashes.json`, `tests/expected-scanner-findings.json`. Regenerated by the lead agent with the catalogue.
- `docs/vulnerabilities/index.md`, `docs/vulnerabilities/dependencies.md`, `.zzz` none. Both are shared. This branch reports what they need to say.
- `.zazz/specifications/README.md`. Shared. Its row for this specification says "Planned" until the lead agent updates it.
- The gateway's pass-through controllers for this service's `/internal/*` paths. The gateway's.
- Anything under `tests/e2e/`. The lead agent's, in Step 3.
- The six safe operations of [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not).
- A delivery queue, retries, back-off, real email or SMS, rate limits, a worker ([ADR-004](../architecture/decisions/ADR-004-ephemeral-stores.md)).
- A receiver on port 4010 inside the whole lab. See [OQ-7](#10-open-questions).

---

## 4. Decisions

Each answers "why this over the obvious alternative?"

### D-1 — One attacker value, two targets, also where the shapes differ

**Decision.** The "one payload" of a both-directions test is one attacker value, written once in the test and sent to the vulnerable operation and to each counterpart. Where a counterpart's input has the same shape, the payload object is the same object. Where it does not, the same value travels in the field of the counterpart that plays the same role: its free-text field, or the typed field the value claims to be. Each test says, in its assertion message, which field carried it.

**Why.** The testing strategy's example has two operations with identical arguments. This service's do not: `setWebhookUrl(url: String!)` faces `POST /internal/alerts/import`, which takes `json`; `createSmartAlert(expression: String!)` faces `createRuleAlert(rule: RuleInput!)`, which has no free-text field at all. Insisting on a byte-identical body would leave those counterparts untested, and sending a different value would test nothing. The rule above keeps what the pattern is for: the counterpart meets the same attack and stays inert.

### D-2 — Twenty-two safe operations are built, and six are not

**Decision.** Every protected counterpart is built: sixteen operations, plus the logging interceptor that is the second technique of INJECT-002. Six more safe operations are built because something needs them. The other six in the service specification are not built.

| Safe operation | Built | What needs it |
| --- | --- | --- |
| `alerts`, `createAlert`, `createRuleAlert`, `setWebhookUrl`, `registerWebhook`, `setChannel`, `setChannels`, `previewWebhook`, `broadcastAnnouncement`, `User.alerts` | Yes | Protected counterparts of the ten scenarios |
| `POST /internal/alerts/import`, `…/import-url`, `POST /internal/webhooks/test`, `POST /internal/announcements/notify`, `GET /internal/announcements/:id`, `…/:id/page` | Yes | Protected counterparts of the ten scenarios |
| `announcements` | Yes | Already in the skeleton. The lead agent's integration test and Postman request call it |
| `evaluateAlerts` | Yes | FR-5.3. It is where DESER-002 runs, and SSRF-001's second counterpart is refused in it |
| `deleteAlert` | Yes | FR-5.1 ("creates, lists and deletes"). It is the own-data operation by `id` that the authorization suite needs |
| `User.webhookUrl` | Yes | SSRF-001's first counterpart is proved by the saved URL being unchanged, which needs a read |
| `User.notificationSettings` | Yes | The only read of the channels. The functional suite proves the seeded settings through it |
| `GET /internal/deliveries` | Yes | Returns the whole record, `responseBody` included. OS-001 and DESER-003 are proved by what the notifier printed, which the GraphQL `Delivery` type does not carry |
| `deliveries` (GraphQL), `User.deliveries` | No | The GraphQL `Delivery` type has no `responseBody`, so neither could show what the suites need to read. Every operation that records a delivery returns it, and [AC13](#6-acceptance-criteria) is met by the REST read |
| `updateNotificationSettings` | No | The same technique as `setChannels`, a typed input. No scenario names it and no flow needs a second one |
| `importAlerts` (GraphQL) | No | The GraphQL twin of `POST /internal/alerts/import`, which is the counterpart SSRF-003 names. No scenario or flow calls the other |
| `GET /internal/announcements` | No | `announcements` (GraphQL) lists them. No scenario or test needs the REST list |
| `POST /internal/announcements` | No | A REST create that sends through `execFile`: `broadcastAnnouncement` does the same and is the counterpart both scenarios name. XSS-001's setup uses `broadcastAnnouncement` |

**Why.** [ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md) fixed the ratio at about one and a half safe operations for every vulnerable one: for this service's nine, about 14. The sixteen protected counterparts alone are above that, so all of them are built and the ratio gives way — the evidence for a scenario outranks the number. Of the safe operations that are nobody's counterpart, the most needed are built first; the test applied to each is the one the lead agent gave: a flow, a test or a scenario. Six of the service specification's 28 safe operations serve no flow, test or scenario, and are not built; [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not) records each. The four `User` fields and the two delivery reads are the only places the rule needed thought, and the table gives the reason for each.

### D-3 — One operation per file, on both sides

**Decision.** Every protected counterpart and every vulnerable operation is in a file of its own, named for its feature. They share services and repositories.

**Why.** The catalogue hashes each registered file and says, per file, whether a scanner must report it. The false-positive claim of a counterpart is a claim about its *file*: with two counterparts in one file, a finding against either is scored against both, and one changed line re-hashes two claims. One operation per file makes each claim exactly as wide as the operation. ADR-008 asks this of the vulnerable side already.

### D-4 — A listener the test starts stands in for "another service's internal endpoint"

**Decision.** In this service's own tests, the address a request-forgery payload points at is served by a listener the test starts on `127.0.0.1`, on a port the system assigns, answering `/internal/health` with a body that carries the marker. The test checks that the port is not 4010.

**Why.** The service specification's marker is a request to `http://127.0.0.1:3102/internal/health`. Three things rule that address out of this service's tests: no other service runs in them (FR-9.2, ADR-010); port 3102 is the trading builder's test port on this shared machine; and that listener speaks HTTP/2 cleartext, which this service's HTTP/1.1 client cannot talk to ([OQ-4](#10-open-questions)). A stand-in keeps the proof honest: the test observes the request arrive and reads the marker in what came back. The real addresses are used where they exist, in the Postman collection, under the whole lab.

### D-5 — What a delivery record holds, and when a refusal is an error and when it is a record

**Decision.** A delivery is made in one of three ways, and the record says what happened in each.

| Made by | Used by | `status` | `responseBody` | `lastError` |
| --- | --- | --- | --- | --- |
| An HTTP client through the outbound guard | `previewWebhook`, `POST /internal/webhooks/test`, `evaluateAlerts`, `POST /internal/announcements/notify` | `DELIVERED` on a 2xx, `FAILED` otherwise | The answer's body | The guard's reason, the answer's status, or why it could not be reached |
| An HTTP client with no guard | `testWebhook`, `POST /internal/alerts/fetch` | The same | The answer's body | The same |
| The notifier command | `broadcastAnnouncement`, `POST /internal/announcements/send` | `DELIVERED` when the command exits 0 | What it printed | What it printed on stderr |

The outbound guard refuses in one of two places, and the record follows the place. At save time (`setWebhookUrl`) the refusal is an error, `BAD_USER_INPUT` with the guard's reason. At send time (`registerWebhook`, `previewWebhook`, `import-url`, `webhooks/test`, `evaluateAlerts`) nothing is sent and the delivery is recorded `FAILED`, with the guard's reason in `lastError`. A REST route answers 400 with the same reason.

**Why.** "The delivery attempt is recorded, whatever happened" is the service specification's rule for an alert. Applying it to every delivery gives each of the four scenarios whose marker is read from a delivery record one place to read it from, with or without a receiver: the whole lab starts none on 4010 ([OQ-7](#10-open-questions)). The alternative, raising on every refusal, would leave SSRF-001's second counterpart with nothing to show: its whole claim is "refused at *delivery* time".

### D-6 — The signature key is derived from the run's `JWT_SECRET`

**Decision.** `X-VCX-Signature` is `sha256=<hex>`, the HMAC-SHA256 of the raw body under a key derived once at start: the HMAC-SHA256 of the text `vcx/webhook-signature` under `JWT_SECRET`.

**Why.** The service specification fixes the header and the algorithm, not the key. A new required variable would change the launcher, which is shared and makes exactly two secrets; an optional one with a default would be a hard-coded secret, which is a scenario of another service, not a pattern of this baseline. Using the session secret directly would make one key protect two things. A derived key needs nothing new, is generated per run, and is in no source file.

### D-7 — Templates and the notifier live outside `src/`, resolved from the module's own directory

**Decision.** `apps/notifications/views/*.ejs` and `apps/notifications/scripts/notify.js`. A module finds them by `import.meta.dirname`: from `src/<module>/` and from `dist/<module>/` the relative path is the same.

**Why.** The build emits JavaScript and nothing else. Templates inside `src/` would need an asset-copy step in `nest-cli.json` for the built service and a different path for a test, which runs from the source. One location outside `src/` serves `main.ts`, a test's application and the launcher with the same code.

### D-8 — The JSON body parser is a NestJS middleware class registered in a module

**Decision.** `JsonBodyMiddleware implements NestMiddleware`, which runs `express.json()`; a module applies it to the `/internal/*` routes with a `MiddlewareConsumer`. GraphQL parses its own body.

**Why.** `main.ts` is not what a test runs: `startService` creates the application from the module. `app.use(express.json())` in `main.ts` would leave every REST test parsing bodies through Nest's default parser and the built service through another line of code. A middleware class is also one of the three Express idioms the service exists to show (ADR-006), and it is the one with a job to do.

### D-9 — PROTO-003 is proved twice: on the prototype, and through a typed input

**Decision.** The exploit assertion reads the prototype in the test process, where the service runs: after `setChannelByPath(path: "__proto__.webhook", enabled: true)`, `({}).webhook` is `true`. It then shows the same fact from outside: `setChannels(input: { email: false })`, which says nothing about `webhook`, comes back with `webhook: true`. The test deletes the property again before the next test.

**Why.** The GraphQL type of the operation cannot show a property of `Object.prototype`, and a Postman script cannot read the service's memory. The second proof works because the GraphQL runtime reads each input field with a plain property access (`coerceInputValue.js`, line 190, in `graphql` 16.15.0), so a field the caller left out is found on the prototype. That is a fact about the runtime, not a weakness in the counterpart: `setChannels` is written as carefully as its claim needs, and the polluted prototype reaches it anyway. It is the honest meaning of "reaches every object". Deleting the property afterwards is hygiene for the tests that follow, not a fix: the operation still pollutes.

### D-10 — OS-002's payload is a config file curl is made to read

**Decision.** In the integration test the payload is `-K<file>`, where `<file>` is a file the test creates under a temporary directory it makes and removes, holding one line, `zazzles-lab-marker`. In the Postman request it is `-h`.

**Why.** `execFile('curl', [url])` gives the caller exactly one argument. Checked on this machine on 2026-11-26: `-o<file>` with no URL writes nothing (curl exits 2 before any transfer), `--long=value` is refused by the installed curl, and `-K<file>` (the short form of `--config`, which the service specification names) makes curl read the file and print each of its lines on stderr, so the file's content comes back in `lastError`. That is a gain a test can name: a file at a path the caller chose was read, and its content returned. A Postman script cannot create a file, so its payload is `-h`: curl prints its own usage instead of asking for any URL, which shows the string was taken as an option. The alternative, `-o`, demonstrates nothing with one argument.

### D-11 — The type declaration of `dot-prop` is local

**Decision.** `apps/notifications/src/config/dot-prop.d.ts` declares the four functions the service calls. No `@types/dot-prop`.

**Why.** `dot-prop` 4.1.0 ships no types. One more package, for four one-line declarations, is another entry in the lockfile and in every audit; the lead agent's command for the pins names three packages and this keeps it at three.

### D-12 — One documentation module per family

**Decision.** `docs/vulnerabilities/<family>.md`: `ssrf.md`, `os.md`, `deser.md`, `xss.md`, `proto.md`, `inject.md`, `access.md`. Each scenario under its family holds the five titled sections the [index](../../docs/vulnerabilities/index.md#how-each-scenario-will-be-documented) promises. The three pins have no module of their own: they are SCA-003, SCA-004 and SCA-006 in the shared [dependencies.md](../../docs/vulnerabilities/dependencies.md), which the lead agent owns.

**Why.** Decided by the Project Owner on 2026-11-27, replacing the module-per-scenario this specification drafted (four builders writing one directory at once made per-scenario files look safer, but the merge of `accounts` into `main` joined three of the families into one module each anyway, and the owner directed the same shape for the rest). A family another service also has is one module; each service's introduction sits under its own lead-in, and the scenarios follow the order of their IDs. This replaces D-12 as drafted and the documentation half of [AC12](#6-acceptance-criteria).

### D-13 — `alertsOf` is built as typed, and the webhook URL it promises is flagged

**Decision.** `alertsOf(userId: ID!): [Alert!]!` returns the named user's alerts. No field is added to `Alert`.

**Why.** The service specification's row says the operation answers "any user's alerts, and its webhook URL", and types the answer `[Alert!]!`, which has no field for a URL. Adding one changes a type the gateway composes, which is the Deliverable Owner's call ([OQ-1](#10-open-questions)). Built as typed, the scenario is whole in what it gains, another user's alerts, and one line of the resolver file away from the rest if the answer is yes.

### D-14 — Each pin arrives with the first scenario family that reaches it

**Decision.** The three pins are installed one at a time, each in the commit of the first scenario family whose code reaches it, never all at the start: `node-fetch` 2.6.6 with SSRF (`testWebhook` posts through the client with no guard), `ejs` 3.1.6 with DESER (`ejs.render` compiles the caller's body), `dot-prop` 4.1.0 with PROTO (`set` walks the caller's path). `pnpm audit:update` follows each install, so the snapshot never disagrees with the manifest in a commit. The safe baseline runs on the skeleton's current versions (`node-fetch` 2.7.0, `ejs` 3.1.10); the swap is part of the family's commit.

**Why.** The lead agent's order of work for this session: a pin lands with the code that reaches it, its test and its documentation, and the safe baseline stands on its own before any vulnerable operation is written. One pull request is one change; the commits inside it only have to come in an order a reviewer can follow.

---

## 5. Agent Implementation Rules

These rules apply throughout implementation.

### Team Integration

Commit and push only to `phase-2c-notifications`. Do not merge, to `phase-1-foundation` or anywhere else. Never commit to the base.

### Command Working Directory

Every command runs from the worktree, `/Users/michael/Dev/zazzcode/vuln-nestjs-wt/notifications`. Nothing is run in `/Users/michael/Dev/zazzcode/vuln-nestjs` or in the other three worktrees.

### Commit And Push

Commit and push after each step of [§8](#8-tdd-entry-point--prescriptive-execution-sequence). Each commit is green on its own, its message follows Conventional Commits with `notifications` as the scope, and its body says why. No large change is left uncommitted.

### Ports

This machine is shared with three other builders.

- Run only what is this service's: `pnpm --filter @zazzles/exchange-notifications test` and `… test:int`, `pnpm lint`, `pnpm format:check`, `pnpm build`.
- Never the root `pnpm test:int`, `pnpm test:e2e`, `pnpm test:api` or `pnpm start` on the default ports.
- To run the whole lab or `pnpm test:api`: `GATEWAY_PORT=4300 ACCOUNTS_PORT=4301 TRADING_PORT=4302 NOTIFICATIONS_PORT=4303 ACCOUNTS_RELAY_PORT=4311 TRADING_RELAY_PORT=4312`, and stop it afterwards.
- This service's integration tests use 3103 and 4010, and nothing else that is fixed.

### Scope Verification

`git diff --stat 421d2a4..HEAD` lists exactly the paths of [§3](#3-scope), with `pnpm-lock.yaml` and `tests/expected-audit.json` among them and nothing else outside.

### Autonomy Boundaries

Hard constraints:

- Scope in [§3](#3-scope).
- One pull request.
- The invariants in [§2](#2-invariants).
- The service specification's names, callers and GraphQL types.
- Acceptance criteria in [§6](#6-acceptance-criteria).
- Halt conditions below.

Adaptive guidance:

- File names inside the service, helper names, the bodies of the skeletons in [§8](#8-tdd-entry-point--prescriptive-execution-sequence).
- How a test captures a log line and how a Postman request prepares its state.
- The wording of the guard's reasons, as long as a test's expression matches it.

A mechanism this specification relies on and has not run yet is marked "to confirm" in [§8](#8-tdd-entry-point--prescriptive-execution-sequence). If it does not hold, take the nearest alternative that keeps the acceptance criterion true, and record it in [§13](#13-implementation-and-review-change-log).

### Run Log

Maintain `.zazz/ephemeral/002c-notifications-run-log.md`. Append after each open-question resolution, phase completion, deviation and load-bearing failure. Never rewrite an entry.

### Execution Tracking

The run log, the pull request and the report are the record.

- **Authoritative record:** the pull request, with its acceptance-criteria checklist.
- **Fallback:** `.zazz/ephemeral/002c-notifications-report.md`.

### Lead Agent / Contributor Agent Coordination

One Contributor Agent, working alone in the worktree named above. The lead agent integrates in Step 3 and owns every shared file.

| Phase / task | Responsible agent | Allowed scope | Required evidence |
| --- | --- | --- | --- |
| [§8](#8-tdd-entry-point--prescriptive-execution-sequence), phases 0 to 6 | Contributor Agent | [§3](#3-scope) | Exit codes in the run log and the report; the catalogue file |
| Adding the catalogue entries and re-snapshotting | Lead Agent | `catalog/`, `tests/` | After this branch is reported |

### Independent QA / Verification Agents

The specification asks for one fresh-context verifier after the definition of done is met. If the harness gives this session no way to dispatch one, the Contributor Agent runs the verifier's checklist itself against every acceptance criterion, says so in the run log and the report, and the lead agent dispatches the independent one.

### Halt Conditions

Stop and end the turn with the question if any of these occur:

1. Implementation needs a change outside [§3](#3-scope), beyond the two command-made files.
2. Scope verification shows a file outside [§3](#3-scope).
3. A change would break an invariant of `AGENTS.md`.
4. The service specification is wrong in a way that blocks an operation: two of its requirements conflict and no reading satisfies both, or an operation cannot be built as typed.
5. A pin does not install, or does not work in this service.
6. The same automated test fails three times in a row for a reason not understood.
7. Port 3103 or 4010 is in use by another builder when a test needs it, and it stays in use.

A gap that has a default is not a halt: resolve it by the default, record it in [§10](#10-open-questions) and [§13](#13-implementation-and-review-change-log), and continue.

---

## 6. Acceptance Criteria

Each is testable from its own text.

- **AC1 — The three pins, exact and reported.** `apps/notifications/package.json` declares `node-fetch` `2.6.6`, `ejs` `3.1.6` and `dot-prop` `4.1.0`, each an exact version and each in `dependencies`. `pnpm audit --prod` reports, for `apps/notifications`, GHSA-r683-j2x4-v87g, GHSA-phwq-j96m-2c2q, GHSA-ghr5-ch3p-vcr6 and GHSA-ff7x-qrg7-qggm, and nothing of another service. After `pnpm audit:update`, `pnpm audit:check` exits 0. Verified by: the two commands, and `tests/manifests.spec.ts`.
- **AC2 — Four tables, the fake data, fixed identifiers.** The store holds `alerts`, `deliveries`, `announcements` and `user_settings`. At start and after reset: five alerts (ids 1 to 5, one per user of `labUsers` with a wallet, on five different markets, enabled), five settings rows (the same users, `webhookUrl` `http://127.0.0.1:4010/webhook/<name>`, every channel on), one announcement with plain text (id 1), no delivery. Verified by: `apps/notifications/test/store.int-spec.ts`.
- **AC3 — A round trip to every table, and reset.** A row written through each repository is read back with the values written. After `POST /internal/lab/reset` with the service token every table holds exactly AC2's rows. Verified by: `store.int-spec.ts`, `app.int-spec.ts`.
- **AC4 — The outbound guard.** Given a URL and the allowlist, the guard decides: the scheme is `http` or `https`; the origin, compared as a string, is on `WEBHOOK_ALLOWED_ORIGINS`; the host resolves to a loopback address. A URL that fails any one is refused with a reason that names the rule. The allowlist is compared before any name is resolved. Verified by: `apps/notifications/src/webhooks/outbound-guard.service.spec.ts`, a table of at least ten URLs.
- **AC5 — The guarded client.** A delivery through the client is a `POST` with `content-type: application/json`, the body it was given and `X-VCX-Signature: sha256=<hex>` as in [D-6](#d-6--the-signature-key-is-derived-from-the-runs-jwt_secret). It follows no redirect: a 3xx is recorded `FAILED` with a reason that says so. It gives up after 5 seconds. Verified by: `test/functional.int-spec.ts`, `test/scenarios/ssrf.int-spec.ts`.
- **AC6 — A crossed alert produces one signed delivery.** With the receiver of [§7](#7-test-strategy) on 4010, `evaluateAlerts` with a price that crosses Alice's alert returns one delivery for it, `DELIVERED`, `attempts` 1, `url` her webhook URL. The receiver verifies the signature with the key of [D-6](#d-6--the-signature-key-is-derived-from-the-runs-jwt_secret) over the raw body. An alert that is not crossed, disabled, or whose symbol is not in `prices` produces none. Verified by: `test/functional.int-spec.ts`, `apps/notifications/src/alerts/alert-rule.spec.ts`.
- **AC7 — Every protected counterpart does what its row says.** Each of the sixteen, and the logging interceptor, behaves as in the table of [§7](#7-test-strategy) "Protected counterparts". Verified by: `test/functional.int-spec.ts`.
- **AC8 — Every vulnerable operation carries its marker and is exploitable.** Each of the nine has, on the line that is the weakness, a comment `// <ID> / <CWE>: …`. Each of the ten scenarios has a test that sends one payload to the vulnerable operation and to each counterpart: the exploit assertion names what was gained, the counterpart assertion names why it was refused. Verified by: the seven files of `test/scenarios/`.
- **AC9 — Authorization.** `evaluateAlerts` and `broadcastAnnouncement` refuse a `USER` token with `FORBIDDEN`, and no token with `UNAUTHENTICATED`. `POST /internal/announcements/send` and `…/notify` answer 403 and 401 in the same cases. `deleteAlert` refuses another user's alert with `FORBIDDEN` and an unknown one with `NOT_FOUND`. `User.alerts`, `User.webhookUrl` and `User.notificationSettings` answer for the caller's own user and for an `ADMIN`, refuse another user with `FORBIDDEN` and no token with `UNAUTHENTICATED`. `GET /internal/announcements/:id`, `…/page` and `…/html` answer with no token. Verified by: `test/authorization.int-spec.ts`.
- **AC10 — The Express idioms.** `express.json()` is mounted by a NestJS middleware class, and `GET /internal/announcements/:id/page` is rendered with `res.render()` from an `ejs` template. A REST route receives a JSON body parsed by that middleware. Verified by: `test/functional.int-spec.ts`, `test/scenarios/xss.int-spec.ts`.
- **AC11 — The three pins are reached at run time.** A delivery made with `node-fetch` 2.6.6 follows a redirect and the redirected request carries the delivery's headers. `ejs` 3.1.6 renders a template. `dot-prop` 4.1.0's `set` is called with a path the caller supplied. Each is shown by a test against the running service, and each installed version is the one read from the service's own `node_modules`. Verified by: `test/pins.int-spec.ts`.
- **AC12 — Documentation.** Seven modules under `docs/vulnerabilities/`, one per family this service has a scenario in — `ssrf.md`, `os.md`, `deser.md`, `xss.md`, `proto.md`, `inject.md`, `access.md` — each scenario under its family with its five titled sections, the flaw, a reproduction with curl and the request to paste into Burp, the counterparts compared with their scoped claim, and the tests. No module for the pins: they are SCA-003, SCA-004 and SCA-006 in the shared `dependencies.md`. Every command in them was run. Verified by: review against the run log, which names the file of each command's output.
- **AC13 — Postman.** The notifications collection carries one request per scenario, ten in all, added to the ones that exist. Each uses only `gatewayUrl`, `accountsUrl`, `tradingUrl`, `notificationsUrl`, `accessToken`, `adminToken`, `bobToken` and `internalToken`, directly or through a script. Each has a test script whose assertions held. `pnpm test:api` on the builder's ports exits 0. Verified by: the root `pnpm test` (which checks the first two without Newman), and `pnpm test:api` on ports 4300 to 4312.
- **AC14 — The catalogue file.** `.zazz/ephemeral/002c-notifications-catalogue.json` is an array of 10 entries, the ten scenarios and no pin (the pins are advisory rows in the audit snapshot and sections of the shared `dependencies.md`, not catalogue entries). Each entry is valid against `catalog/catalog.schema.json`, and every `source`, `safeControl`, `safeControls`, `documentation` and `test` path in it exists on the branch. Verified by: `validateAgainst` from `scripts/check-scenarios.mjs`, run over the file, and a check that each path exists.
- **AC15 — A clean stop.** After the service stops: nothing listens on 3103 or on 4010, no stand-in listener answers, and no temporary directory a test created remains. Verified by: `test/stop.int-spec.ts`, and every file's `afterAll`.
- **AC16 — Static checks and scope.** `pnpm lint`, `pnpm format:check` and `pnpm build` each exit 0. `git diff --stat 421d2a4..HEAD` lists only the paths of [§3](#3-scope). Verified by: the three commands, each exit code read, and the diff.
- **AC17 — The counts match the code.** 9 vulnerable operations, 16 protected counterparts, 6 other safe operations, 22 safe in all, 10 scenarios. Verified by: a count of the operation files, against [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not).

---

## 7. Test Strategy

Test value rule: every test below proves an acceptance criterion, an invariant or a named risk. No test asserts only that a function was called.

Test contract rule: the intent of each test is the contract. Names and mechanics may adapt. Coverage may not be weakened to make an implementation pass.

### Reference data sources

- `libs/lab-data` — the users and their fixed identifiers, the five markets and their reference prices, `labStart`. The only source of fake data.
- The seed of AC2 — fixed ids 1 to 5 for alerts and for settings. After a reset the next alert is id 6.
- `.zazz/project/services/notifications.md` §6 — the harmless markers.
- The payload table below — one attacker value per scenario.

### The payload of each scenario

| Scenario | The attacker value | To the vulnerable operation | To counterpart 1, carried by | To counterpart 2, carried by |
| --- | --- | --- | --- | --- |
| SSRF-001 | `url`: `http://127.0.0.1:<stand-in>/internal/health` | `testWebhook(url)` | `setWebhookUrl(url)`: `url` | `registerWebhook(url)`: `url`, then `evaluateAlerts` |
| SSRF-003 | the same `url` | `POST /internal/alerts/fetch`, `url` | `POST /internal/alerts/import`, `json` (the only field it has) | `POST /internal/alerts/import-url`, `url` |
| OS-001 | `title`: `Maintenance"; echo zazzles-lab-marker; echo "` | `POST /internal/announcements/send` | `broadcastAnnouncement`, `title` | `POST /internal/announcements/notify`, `title` |
| OS-002 | `url`: `-K<marker file>`; `-h` in Postman | `pingWebhook(url)` | `previewWebhook(url)`: `url` | `POST /internal/webhooks/test`, `url` |
| DESER-002 | `expression`: `alert.label = "zazzles-lab-marker", true` | `createSmartAlert(expression)`, then `evaluateAlerts` | `createAlert`, `input.label` (its free-text field), then `evaluateAlerts` | `createRuleAlert`, `rule.symbol` (its only text field), then `evaluateAlerts` |
| DESER-003 | `body`: `Scheduled maintenance at 02:00 UTC. <%= 7*7 %>` | `POST /internal/announcements/send` | `broadcastAnnouncement`, `body` | `POST /internal/announcements/notify`, `body` |
| XSS-001 | an announcement whose `body` is `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">` | `GET /internal/announcements/:id/html` | `GET /internal/announcements/:id` | `GET /internal/announcements/:id/page` |
| PROTO-003 | `path`: `__proto__.webhook`, `enabled`: `true` | `setChannelByPath(path, enabled)` | `setChannel(name: path, enabled)` | `setChannels(input: { path, enabled })` |
| INJECT-002 | `label`: `BTC above 70k` and a newline and `[admin] creditWallet u-bob amount=1000.00 status=ok` | `createLabeledAlert(label, symbol, direction, threshold)` | `createAlert`, `input.label` | the same operation: the interceptor's record |
| ACCESS-006 | `userId`: `u-bob` | `alertsOf(userId)` | `alerts`, which takes no `userId` | `User.alerts`, for the representation `{ id: "u-bob" }` |

### What each scenario's test asserts

| Scenario | Exploit: what was gained | Counterpart 1: why refused | Counterpart 2: why refused |
| --- | --- | --- | --- |
| SSRF-001 | The stand-in received a `POST` to `/internal/health`, and the delivery is `DELIVERED` | `BAD_USER_INPUT`, the reason names the allowlist, and the saved webhook URL is still the seeded one | The URL was saved, and in the delivery that follows nothing was sent: `FAILED`, the reason names the allowlist, the stand-in received nothing |
| SSRF-003 | The answer holds the stand-in's status and its marker body | `400`: the value is not an alert document; the stand-in received nothing | `400`, the reason names the allowlist; the stand-in received nothing |
| OS-001 | A delivery record whose `responseBody` has a line that is exactly `zazzles-lab-marker`: a command the caller wrote ran | The record holds the title as it was sent, on one line, and no line is the marker | The receiver was sent the title as text, on one line, and no line is the marker; no process was started |
| OS-002 | The record's `lastError` holds `zazzles-lab-marker`: curl read the file the caller named and returned its line | `FAILED` before any request: the value is not an absolute `http` or `https` URL | `400` with the same reason |
| DESER-002 | After `evaluateAlerts`, the smart alert's `label` is `zazzles-lab-marker`: the stored string ran as code and rewrote a row | The same string is the label still, and no delivery was made for it | The same string is the symbol still, no delivery was made, and `expression` is refused as a property the rule does not have |
| DESER-003 | A record whose `responseBody` contains `49` and not `<%= 7*7 %>` | The record contains `<%= 7*7 %>` and not `49` on its own | The receiver was sent the body with `<%= 7*7 %>` in it |
| XSS-001 | `200`, `text/html`, no `Content-Security-Policy`, and the marker script in the body as it was stored | `application/json`, `x-content-type-options: nosniff`, and the marker inside a JSON string | `text/html`, a `Content-Security-Policy` that allows no script, and the marker with `<` as `&lt;` |
| PROTO-003 | `({}).webhook` is `true`, and `setChannels({ email: false })` then answers `webhook: true` | The enum refuses the value: `GRAPHQL_VALIDATION_FAILED`; `({}).webhook` is `undefined` | The input refuses both properties: `BAD_USER_INPUT`; `({}).webhook` is `undefined` |
| INJECT-002 | The logger was given one message with a raw newline in it, whose second line reads as an administrator action | The logger was given one line: the label JSON-encoded, its newline two characters | The logger was given one structured record in which `label` is a field whose value is the payload |
| ACCESS-006 | Alice is answered Bob's alert: his `userId`, symbol, direction and threshold | Only alerts whose `userId` is Alice's; Bob's is absent; and `userId` is refused as an argument | `FORBIDDEN` for Alice on Bob's representation; Bob's own and an administrator's are answered |

### Protected counterparts: the behaviour each test asserts

| Operation | Caller | Behaviour, as built |
| --- | --- | --- |
| `alerts(limit, offset)` | user | The caller's alerts, by id |
| `User.alerts` | user | For the caller's own user, or any user for an `ADMIN`. Otherwise as [AC9](#6-acceptance-criteria) |
| `createAlert(input)` | user | Stores an enabled alert with no expression. Its label is logged JSON-encoded, and the interceptor records it as a field |
| `createRuleAlert(rule)` | user | The same comparison as `createAlert`, from an input with no free-text field |
| `setWebhookUrl(url)` | user | The guard decides at save. A refusal is `BAD_USER_INPUT` with the reason; nothing is saved |
| `registerWebhook(url)` | user | Saves the string. Nothing is decided here |
| `setChannel(name, enabled)` | user | An enum name. Writes that one channel |
| `setChannels(input)` | user | Writes only the fields given |
| `previewWebhook(url)` | user | One sample delivery through the guard. Returns its record |
| `broadcastAnnouncement(input)` | admin | Stores the announcement with `sentAt`. Sends each recipient the notice rendered from the fixed template, through `execFile` with an argument vector. Returns the announcement |
| `POST /internal/alerts/import` | user | `json`: a JSON array of `{ symbol, direction, threshold, label? }`. Creates the caller's alerts from it. Fetches nothing. `201` |
| `POST /internal/alerts/import-url` | user | `url`, through the guard. The same from what it fetched. `201` |
| `POST /internal/webhooks/test` | user | `url`: one delivery through the guard. `200` with the record |
| `GET /internal/announcements/:id` | public | The announcement as JSON, with `x-content-type-options: nosniff`. `404` when there is none |
| `GET /internal/announcements/:id/page` | public | HTML from the fixed template, the body escaped, with a `Content-Security-Policy` that allows no script. `404` when there is none |
| `POST /internal/announcements/notify` | admin | Sends the body as plain text, in process, to each recipient's webhook. Creates no process. `201` with the announcement and the records |
| The logging interceptor | | On `createAlert` only: one record, `label` a field |

### Unit (`pnpm --filter @zazzles/exchange-notifications test`)

| Test | Proves | Asserts |
| --- | --- | --- |
| `src/webhooks/outbound-guard.service.spec.ts` | AC4 | A table: `http`, `https`, a relative value, a value with no scheme, another scheme, a port not on the allowlist, a host that is not the allowlisted one, a path and a query on an allowed URL, and that no name is resolved for a refused origin |
| `src/webhooks/webhook-signature.spec.ts` | AC5, D-6 | The header for a body and a key; that a receiver recomputes it from the key and the raw body; that another body or another key does not match |
| `src/alerts/alert-rule.spec.ts` | AC6 | `ABOVE` and `BELOW`, crossing by one unit of the eighth decimal place, equal is not crossed, and that numbers of different length compare by value and not as text |
| `src/announcements/announcements.service.spec.ts` | Existing | Unchanged |
| `src/config/environment.spec.ts` | AC4 | The default of `WEBHOOK_ALLOWED_ORIGINS`; that a missing or malformed variable stops the service |

`libs/testing` is proven by every integration file and has no unit test of its own.

### Integration (`pnpm --filter @zazzles/exchange-notifications test:int`)

One service, started in the test process with the Express adapter on 3103, and the test's receiver on 4010. Files run one at a time.

| Test | Proves | Asserts |
| --- | --- | --- |
| `test/app.int-spec.ts` | AC3, AC10 | The seven existing tests, kept; the schema declares the types and inputs of the service specification and `User` with `@key` and `@external` |
| `test/store.int-spec.ts` | AC2, AC3 | AC2's rows at start; a write and a read on each table; reset |
| `test/functional.int-spec.ts` | AC5, AC6, AC7, AC10 | The table above, one `test` per operation; the signed delivery |
| `test/authorization.int-spec.ts` | AC9 | AC9, each case by name |
| `test/scenarios/ssrf.int-spec.ts` | AC8 | SSRF-001, SSRF-003 |
| `test/scenarios/os.int-spec.ts` | AC8 | OS-001, OS-002 |
| `test/scenarios/deser.int-spec.ts` | AC8 | DESER-002, DESER-003 |
| `test/scenarios/xss.int-spec.ts` | AC8, AC10 | XSS-001 |
| `test/scenarios/proto.int-spec.ts` | AC8, D-9 | PROTO-003 |
| `test/scenarios/inject.int-spec.ts` | AC8 | INJECT-002 |
| `test/scenarios/access.int-spec.ts` | AC8, AC9 | ACCESS-006 |
| `test/pins.int-spec.ts` | AC11 | The three pins reached |
| `test/stop.int-spec.ts` | AC15 | The stop |

Every scenario file restores what it changed that reset does not: the prototype (PROTO-003), a log spy (INJECT-002), the stand-in and the marker file (OS-002).

### API collection (`pnpm test:api`)

One request per scenario, in a folder "Scenarios". The existing folders and requests stay as they are, in front. Each scenario request prepares the state it needs in a pre-request script and asserts its marker in a test script. The requests that need no caller state: none. The ten, by name:

`SSRF-001: a webhook posted inside the lab`, `SSRF-003: a URL fetched and read`, `OS-001: a title that reaches a shell`, `OS-002: an option where a URL was expected`, `DESER-002: an alert expression that is code`, `DESER-003: an announcement body that is a template`, `XSS-001: an announcement page that serves script`, `PROTO-003: a path that reaches every object`, `INJECT-002: a label that forges a log line`, `ACCESS-006: another user's alerts by id`.

### Existing coverage intentionally reused

- `libs/internal-auth`'s unit tests already prove the guards. The authorization suite of this service proves only that each operation is marked as AC9 says.
- `tests/api/collections.spec.ts` already proves the two Postman checks. No test of this service repeats them.

### Manual verification

- The reproduction of every documentation module, run, with its output kept under `.zazz/ephemeral/`.
- `pnpm test:api` on ports 4300 to 4312, its exit code read.
- The lab started on those ports by hand for the reproductions, and stopped, with nothing left on any of the six ports.

---

## 8. TDD Entry Point + Prescriptive Execution Sequence

The sequence is derived from [§6](#6-acceptance-criteria) and [§7](#7-test-strategy). "To confirm" marks a mechanism the design relies on that has not been run in this service yet.

### TDD Entry Point

The first test that must fail, then pass:

```ts
// apps/notifications/src/webhooks/outbound-guard.service.spec.ts
it('refuses an origin that is not on the allowlist, before any name is resolved', async () => {
  const guard = new OutboundGuardService(['http://127.0.0.1:4010'], lookup);
  expect(await guard.decisionFor('http://127.0.0.1:3000/api/v1/health')).toMatchObject({ allowed: false });
  expect(lookup).not.toHaveBeenCalled();
});
```

### Prescriptive Execution Sequence

Commit and push at the end of each phase.

**Phase 0: this specification**

0.1. Commit it as the first commit of the branch. Push with `--set-upstream`. Open the draft: `gh pr create --draft --base phase-1-foundation --title "Phase 2c: notifications"`.

**Phase 1: the pins, each with its family**

The pins are not installed up front. Each arrives with the first scenario family that reaches it ([D-14](#d-14--each-pin-arrives-with-the-first-scenario-family-that-reaches-it)): `node-fetch` 2.6.6 with SSRF, `ejs` 3.1.6 with DESER, `dot-prop` 4.1.0 with PROTO. After each install, `pnpm audit:update` and `pnpm audit:check`; expect the advisories of that pin under `apps/notifications` and exit 0.

**Phase 2: the store, the guard, the client (AC2 to AC6)**

2.1. `Environment`: `WEBHOOK_ALLOWED_ORIGINS`, a comma-separated list, default `http://127.0.0.1:4010`. `dot-prop.d.ts`.
2.2. The four entities, the repositories, the seed. `test/store.int-spec.ts`. Run `test:int`. Expect green.
2.3. The outbound guard and its unit test. The client: `node-fetch`, `redirect: 'manual'`, 5 seconds, the signature.
2.4. `test/support/`: the receiver on 4010, the stand-in, tokens, the start and stop of one service for a file. `test/stop.int-spec.ts`.
2.5. `evaluateAlerts`, with the comparison in a unit-tested rule. `test/functional.int-spec.ts`, the signed delivery.

**Phase 3: the protected counterparts (AC7, AC9, AC10)**

3.1. Settings: `setWebhookUrl`, `registerWebhook`, `setChannel`, `setChannels`, each in its own file.
3.2. Alerts: `alerts`, `createAlert` with the interceptor, `createRuleAlert`, `deleteAlert`, and the three `User` fields.
3.3. Webhooks: `previewWebhook`, `POST /internal/webhooks/test`. Alerts: the two imports.
3.4. Announcements: the notice and the notifier command, `broadcastAnnouncement`, `POST /internal/announcements/notify`, the JSON answer, the page. `JsonBodyMiddleware`, the views, `res.render()`.
3.5. Deliveries: `GET /internal/deliveries`.
3.6. `test/functional.int-spec.ts` to green, one test per operation. `test/authorization.int-spec.ts`. To confirm here: how a test captures what the logger is given.

**Phase 4: the vulnerable operations, by family (AC8)**

4.1. SSRF: `testWebhook`, `POST /internal/alerts/fetch`. `test/scenarios/ssrf.int-spec.ts`.
4.2. OS: `pingWebhook`, `POST /internal/announcements/send`. `test/scenarios/os.int-spec.ts`. To confirm: the notifier script under the shell-built command line.
4.3. DESER: `createSmartAlert` and the evaluation that runs `eval`. `test/scenarios/deser.int-spec.ts`.
4.4. XSS: `GET /internal/announcements/:id/html`. `test/scenarios/xss.int-spec.ts`.
4.5. PROTO: `setChannelByPath`. `test/scenarios/proto.int-spec.ts`. To confirm: that `dot-prop` 4.1.0 writes to `Object.prototype`, and that the typed input is read off it.
4.6. INJECT: `createLabeledAlert`. `test/scenarios/inject.int-spec.ts`.
4.7. ACCESS: `alertsOf`. `test/scenarios/access.int-spec.ts`.
4.8. `test/pins.int-spec.ts`.

After each family: `pnpm lint`, `pnpm format:check`, `pnpm build`, the unit tests and the integration tests, each exit code read.

**Phase 5: Postman, documentation, catalogue (AC12 to AC14)**

5.1. The ten requests. `pnpm test` for the two checks. To confirm: that a pre-request script can prepare state under Newman.
5.2. Start the lab on ports 4300 to 4312. Run each reproduction. Write the thirteen modules from what was run.
5.3. The catalogue file, checked with `validateAgainst`.
5.4. `pnpm test:api` on the builder's ports. Stop the lab. Check the six ports.

**Phase 6: verification**

6.1. [AC16](#6-acceptance-criteria): the three commands, the two test suites, the diff.
6.2. The verifier's checklist, each criterion PASS or FAIL with its evidence.
6.3. The report `.zazz/ephemeral/002c-notifications-report.md`, and the pull request body from `.github/pull_request_template.md`.

### Skeleton: `apps/notifications/src/config/environment.ts`

```ts
export class Environment {
  @Integer() @IsInt() @Min(1) @Max(65535) NOTIFICATIONS_PORT = 3103;
  @IsString() @MinLength(32) JWT_SECRET!: string;
  @IsString() @MinLength(32) INTERNAL_SERVICE_TOKEN!: string;

  /** The origins a webhook may be sent to, comma-separated. The test receiver by default. */
  @IsString()
  WEBHOOK_ALLOWED_ORIGINS = 'http://127.0.0.1:4010';

  /** The list, as the guard compares it. */
  get webhookOrigins(): string[] {
    return this.WEBHOOK_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter((origin) => origin !== '');
  }
}
```

### Skeleton: `apps/notifications/src/webhooks/outbound-guard.service.ts`

```ts
export type OutboundDecision = { allowed: true } | { allowed: false; reason: string };

@Injectable()
export class OutboundGuardService {
  constructor(private readonly environment: Environment) {}

  /** Every rule but the name resolution. Resolves nothing. */
  decisionFor(url: string): OutboundDecision;

  /** Adds the resolution: the host must resolve to a loopback address. */
  async check(url: string): Promise<OutboundDecision>;
}
```

### Skeleton: `apps/notifications/src/webhooks/webhook-client.service.ts`

```ts
export interface Answer { status: number; body: string; }

@Injectable()
export class WebhookClientService implements OnApplicationShutdown {
  /** One POST through the outbound guard. Resolves with what was answered; never throws for a refusal or a failure. */
  post(url: string, payload: unknown): Promise<DeliveryOutcome>;
  /** How a delivery ended, whichever way it was made. */
  static outcomeOf(answer: Answer | null, error?: string): Pick<DeliveryEntity, 'status' | 'lastError' | 'responseBody' | 'deliveredAt'>;
}

export type DeliveryOutcome = { sent: false; reason: string } | { sent: true; answer: Answer } | { sent: true; error: string };
```

### Skeleton: `apps/notifications/src/webhooks/delivery.service.ts`

```ts
@Injectable()
export class DeliveryService {
  /** Records one attempt, whatever happened. `attempts` is always 1: there is no retry. */
  record(input: { alertId: number | null; userId: string; url: string } & Outcome): Promise<DeliveryEntity>;

  /** For each user whose webhook channel is on and who has a URL. */
  async toRecipients(send: (settings: UserSettingsEntity) => Promise<Outcome>): Promise<DeliveryEntity[]>;
}
```

### Skeleton: the notifier and the two ways of running it

```ts
// apps/notifications/scripts/notify.js — prints the notice it was asked to send, as plain text
//   node scripts/notify.js --title <title> --body <body> --url <url>

// announcements/notice.service.ts
export const NOTICE_TEMPLATE = 'announcement-notice';   // views/announcement-notice.ejs, fixed
export function plainNotice(input: AnnouncementInput): string;   // in process, no template engine

// announcements/notifier.service.ts
export class NotifierService {
  /** The fixed argument vector. One argument per value. */
  sendWithVector(input: AnnouncementInput, url: string): Promise<Outcome>;
}
```

The two twins, each in its own file, each with its marker on the line that is the weakness:

```ts
// announcements/announcements-send.controller.ts
const command = `node scripts/notify.js --title "${title}" --body "${rendered}" --url "${url}"`; // OS-001 / CWE-78: …
const rendered = ejs.render(announcement.body, { user: settings, title });                      // DESER-003 / CWE-1336: …
```

### Skeleton: `apps/notifications/src/alerts/user-notifications.resolver.ts`

```ts
@Resolver(() => User)
export class UserNotificationsResolver {
  @ResolveField(() => [Alert])
  alerts(@Parent() user: { id: string }, @CurrentUser() caller: TokenPayload): Promise<Alert[]>;

  @ResolveField(() => String, { nullable: true })
  webhookUrl(/* the same check */): Promise<string | null>;

  @ResolveField(() => JsonScalar)
  notificationSettings(/* the same check */): Promise<unknown>;
}

/** Reached without the global guard, so the check is here: the caller's own user, or an administrator. */
function requireOwnUser(caller: TokenPayload | undefined, userId: string): void;
```

```graphql
# apps/notifications/src/alerts/user.model.ts — the entity this service adds fields to
@ObjectType() @Directive('@key(fields: "id")') @Directive('@extends')
export class User { @Field(() => ID) @Directive('@external') id: string; }
```

### Skeleton: the evaluation and its twin

```ts
// alerts/alert-evaluation.service.ts — the safe comparison
crossed(alert: AlertEntity, price: string): boolean { return this.rule.crossed(alert, price); }

// alerts/smart-alert.evaluation.ts — called for an alert that has an expression
export function evaluateExpression(alert: AlertEntity, price: string, threshold: string | null): unknown {
  return eval(alert.expression); // DESER-002 / CWE-95: the stored expression is run as code
}
```

---

## 9. Definition Of Done

- [ ] All §1 required reading consumed; `AGENTS.md` verified in place of a standards index.
- [ ] All §10 open questions resolved by their default and logged.
- [ ] Scoped tests green: `pnpm --filter @zazzles/exchange-notifications test`, `pnpm --filter @zazzles/exchange-notifications test:int`.
- [ ] Manual verification complete: the reproductions, `pnpm test:api` on the builder's ports.
- [ ] `pnpm lint`, `pnpm format:check` and `pnpm build` exit 0.
- [ ] Scope verification lists exactly the files in §3.
- [ ] PR shape matches the approved review shape in §3.
- [ ] All AC1–AC17 verified, with evidence cited.
- [ ] The run log is up to date.
- [ ] The verifier's checklist is complete: by a fresh-context verifier, or by this session where the harness offers none, and the report says which.
- [ ] PR body links this specification and lists each AC's verification.

---

## 10. Open Questions

Resolved by default for this unattended session. Each is listed in the pull request and the report for the Project Owner to overrule.

- **OQ-1 — ACCESS-006 promises a webhook URL the type cannot carry.** The row says `alertsOf` answers "any user's alerts, and its webhook URL"; the answer is `[Alert!]!`. **Default:** built as typed ([D-13](#d-13--alertsof-is-built-as-typed-and-the-webhook-url-it-promises-is-flagged)). If the URL belongs in the answer, `Alert` gains a nullable field, which is a change to the service specification.
- **OQ-2 — The service specification's counts.** It says 20 safe GraphQL operations and 29 safe in all. Its own tables list 19 and 28. **Default:** counted from the tables.
- **OQ-3 — One module per family or per scenario.** The index says per family; the lead agent's instruction for Step 2 said per scenario. **Resolved:** per family, by the Project Owner's direction of 2026-11-27 ([D-12](#d-12--one-documentation-module-per-family)).
- **OQ-4 — The marker `http://127.0.0.1:3102/internal/health`.** That listener speaks HTTP/2 cleartext. This service's clients, `node-fetch` and `curl`, speak HTTP/1.1, and so do Postman, Newman and Burp. **Default:** in this service's own tests, the stand-in of [D-4](#d-4--a-listener-the-test-starts-stands-in-for-another-services-internal-endpoint). In the Postman collection, the addresses the whole lab offers over HTTP/1.1: the gateway's and the relays'. To confirm in phase 5, and reported either way.
- **OQ-5 — Reproductions on the default ports.** The brief forbids `pnpm start` on them. **Default:** every reproduction is run with the lab on ports 4300 to 4312 or with this service alone on 3103, and documented as the lead agent's setup guide documents its own: the default ports in the command, and a line saying which ports it ran on.
- **OQ-6 — INJECT-002 from Postman.** The forged line is in the service's log, which no Postman script reads. **Default:** the Postman request asserts that the label with its newline was stored as it was sent; the module shows the line in the output of a lab started by hand.
- **OQ-7 — Nothing receives on 4010 in the whole lab.** The launcher starts four services and two relays. In `pnpm test:api` and `pnpm test:e2e`, every delivery to a user's webhook URL therefore fails with a refused connection. **Default:** each Postman request asserts what holds with no receiver: the record of a refused, allowed and failed delivery is told apart by its `lastError`. Whether the whole lab should start a receiver is the lead agent's decision.
- **OQ-8 — A polluted prototype survives reset.** `POST /internal/lab/reset` restores rows, not the prototype of a running process. After PROTO-003 the service is polluted until it stops. **Default:** this service's tests restore it themselves and say why; the lead agent's end-to-end suite has to order its scenarios or start a lab per file, which it already does.
- **OQ-9 — The pull request's base moved after the branch was cut.** `phase-1-foundation` gained two commits (the CI workflow and the setup guide) that touch no library and no application. **Default:** the branch stays on `421d2a4`. The lead agent rebases it if that is wanted.

---

## 11. Run Log Protocol

This specification uses the run log `.zazz/ephemeral/002c-notifications-run-log.md`. It is under `.zazz/ephemeral/`, which Git ignores: it exists only on the machine that wrote it, and the pull request and the report carry everything in it that matters.

The agent appends; it does not rewrite. Sections: Standards Verification, Facts checked before the specification was written, Phase Completions, Deviations, Manual Evidence Locations, QA Findings & Rework, Issues & Recoveries, Verifier Sub-Agent Report.

Session start protocol:

1. Read this specification end to end.
2. Read the run log in full. If it is missing, rebuild the state from `git log 421d2a4..phase-2c-notifications`.
3. Confirm the next phase from the most recent Phase Completion entry.
4. Begin.

---

## 12. Agent Implementation Prompt

Paste this into a fresh implementation session:

```text
You are continuing in the worktree at /Users/michael/Dev/zazzcode/vuln-nestjs-wt/notifications, on
branch phase-2c-notifications. Your task is to deliver the notifications service of vuln-nestjs.

Specification: .zazz/specifications/002c-notifications.md
Run log: .zazz/ephemeral/002c-notifications-run-log.md (local only)
Execution tracking: local run log only
Implementation coordination: one Contributor Agent, working alone in this service's directory
Companion skills to load: none

Read AGENTS.md first: its invariants override everything else. Then the specification end to end,
then the run log, then the reading the specification pins in its §1.

WHAT THIS REPOSITORY IS
A deliberately vulnerable NestJS application built to test vulnerability scanners. The flaws are
the product: never fix one. It is a sample that is started, preloaded with fake data, exercised and
stopped: nothing that matters only for an application that stays up belongs in it.

NON-NEGOTIABLE RULES
1. Commit and push to phase-2c-notifications only, after each phase. Never merge.
2. Write only inside apps/notifications/, postman/notifications/, your modules under
   docs/vulnerabilities/, the specification and .zazz/ephemeral/. Everything else belongs to the
   lead agent: stop and end your turn with exactly what you need and why.
3. The two shared files you change, you change by command: pnpm-lock.yaml through pnpm add, and
   tests/expected-audit.json through pnpm audit:update. Never edit either.
4. A pin is never upgraded. A vulnerable operation is never fixed. A test that shows one stopped
   working is a regression.
5. Every listener binds 127.0.0.1. Prove the clean stop.
6. This machine is shared. Run only this service's tests. Never pnpm start, pnpm test:e2e or
   pnpm test:api on the default ports: use ports 4300 to 4312.
7. Never document a command you have not run.
8. Names in code are neutral. No vuln, unsafe or safe in an identifier or a path.

ORDER OF WORK
1. Read the specification, the run log and the reading of its §1.
2. Execute the phases of §8 that the run log does not show complete.
3. Run verification and complete the DoD of §9.
4. Write .zazz/ephemeral/002c-notifications-report.md as §7 of your brief asks, and give the same
   report as your last message. Do not merge.

VERIFIER
After the DoD checklist is green, dispatch a fresh sub-agent if the harness allows it:

  "You are verifying Step 2c, the notifications service, in
  /Users/michael/Dev/zazzcode/vuln-nestjs-wt/notifications. Read the specification at
  .zazz/specifications/002c-notifications.md and the run log beside it. For each acceptance
  criterion AC1 to AC17, verify it by running the cited test or command. Confirm with
  git diff --stat 421d2a4..HEAD that the change matches §3. Check each invariant of AGENTS.md
  against the diff. Do not modify any file. Return PASS or FAIL per criterion with the evidence."

Where the harness offers no sub-agent, run that checklist yourself and say in the report that you did.
```

---

## 13. Implementation And Review Change Log

Accepted steering, QA/UAT findings, PR review feedback, or implementation-discovered issues that change the contract must update the affected sections above in place. This section records the audit trail; the current contract lives in the body of the specification.

### 2026-11-27 — The build's deviations, recorded at the finish

**Source.** The build itself, on `phase-2c-notifications` through pull request #5 and on `phase-2c-notifications-finish` after it, and the Project Owner's direction of 2026-11-27 on documentation.

**Changed sections.** [D-10](#d-10--os-002s-payload-is-a-config-file-curl-is-made-to-read); [D-12](#d-12--one-documentation-module-per-family) and the documentation half of [AC12](#6-acceptance-criteria); [AC14](#6-acceptance-criteria); [OQ-3](#10-open-questions); this entry.

**Summary.**

- **D-10, OS-002's payload.** The integration test's payload is not `-K<file>` but a `file://` URL naming a marker file the test writes under a temporary directory: the CI runner's curl (ubuntu) refuses `-K<file>` outright, while `file://` names a path the caller chose whose content curl returns, which is the same gain. The Postman request keeps `-h`, as D-10 says. `os.md` was re-verified against the new payload.
- **D-9, PROTO-003's second proof.** The GraphQL-runtime observation D-9 predicted — an omitted input field read off the polluted prototype — does not hold for this sink: `dot-prop` 4.1.0 walks the row's own prototype chain, so `__proto__.webhook` pollutes `UserSettingsEntity.prototype`, not `Object.prototype`, and a plain input object inherits nothing from it. As built, the exploit's proof is the in-process read of `UserSettingsEntity.prototype.webhook`, the row's own field unmoved, and a plain object unaffected; the deeper path `__proto__.__proto__.webhook` does reach `Object.prototype` and is observable from outside (the process's own validation then fails), which `proto.md` documents. The test still deletes the written property between cases.
- **D-12 and AC12, one module per family.** Seven modules, not ten-plus-three: `ssrf.md`, `os.md`, `deser.md`, `xss.md` were joined with the accounts scenarios of their families when `accounts` merged; `proto.md` and `access.md` are joined the same way in this branch's commits; `inject.md` is new and names `INJECT-001`'s home (`trading-inject.md`) rather than duplicating it. No module for the pins: `dependencies.md`, shared, holds SCA-003, SCA-004 and SCA-006.
- **AC14, ten entries, not thirteen.** The catalogue file holds the ten scenarios; the pins carry no entry, their advisories being the audit snapshot's rows.
- **The six safe operations not built**, as [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not) records: `deliveries` and `User.deliveries` (GraphQL), `updateNotificationSettings`, `importAlerts` (GraphQL), `GET /internal/announcements` and `POST /internal/announcements`. `GET /internal/deliveries` is built in their place. 9 vulnerable operations, 16 protected counterparts, 6 other safe operations, 22 safe in all, 10 scenarios: AC17's counts hold.
- **OQ-4 and OQ-6, as phase 5 found them.** The collection reaches this service at `{{notificationsUrl}}`, its own HTTP/1.1 address, as the existing requests of the merged part already did; no relay is needed for it. INJECT-002's request asserts the label stored as it was sent, its newline in it, as OQ-6 defaulted; the module shows the forged line in a lab started by hand.
- **D-13 held.** `alertsOf` is built as typed, `[Alert!]!`, with no webhook URL field added to `Alert`.

### 2026-11-27 — The service is finished on a second branch, cut from `main`

**Source.** The Project Owner merged pull request #5 at 17:37 on 2026-11-27, unfinished, and its remote branch was deleted. The lead agent cut `phase-2c-notifications-finish` from `main` (`2bfd51c`) at 17:49 for this session to finish the service on, with a new draft pull request against `main`.

**Changed sections.** None in the body; this entry. The branch named in the header and in [§5](#5-agent-implementation-rules) is read as `phase-2c-notifications-finish`, and the scope check of [AC16](#6-acceptance-criteria) is read against `origin/main` (`git diff origin/main...HEAD --name-only`), not against `421d2a4`, which [§3](#3-scope) names: `main` now holds the files of trading and accounts beside this service's, and theirs are not this branch's to touch.

**Summary.** Eight of the ten scenarios were merged through #5 with the safe baseline, the store, the seed, the outbound guard, the signed client, the evaluation, three pins and their advisories. The rest of the service — INJECT-002, ACCESS-006, `test/pins.int-spec.ts`, `test/stop.int-spec.ts`, the documentation modules `proto.md`, `inject.md` and ACCESS-006 in `access.md`, the Postman requests and catalogue entries of PROTO, INJECT and ACCESS, this change log, the pull request body and the report — is delivered on `phase-2c-notifications-finish`.

### 2026-11-27 — The specification revised before the build, on three points

**Source.** The lead agent's brief for this session, carrying [ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md) (decided 2026-11-27, after this specification was drafted), the application's name, and the order the pins are installed in.

**Changed sections.** The header's feature line; [§2, invariant 4](#2-invariants); [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not); [D-6](#d-6--the-signature-key-is-derived-from-the-runs-jwt_secret); [AC5](#6-acceptance-criteria); [D-14](#d-14--each-pin-arrives-with-the-first-scenario-family-that-reaches-it); the phases of [§8](#8-tdd-entry-point--prescriptive-execution-sequence).

**Summary.** Invariant 4 and D-2 were written to the decision of 2026-11-26 ("no safe operation exists for a ratio") and now say what ADR-013 says: every vulnerable operation keeps its protected counterpart, the lab keeps about one and a half safe operations for every vulnerable one, and where the two disagree the counterpart is built and the ratio gives way. The counts do not change: 16 counterparts, 6 other safe operations a flow, a test or a scenario needs, 22 safe in all, 9 vulnerable, 10 scenarios. The application is named VCX, not by its old name: the header, the signature header (`X-VCX-Signature`) and the key derivation text (`vcx/webhook-signature`) of D-6 and AC5. The three pins are installed one at a time, each in the commit of the first scenario family that reaches it ([D-14](#d-14--each-pin-arrives-with-the-first-scenario-family-that-reaches-it)), not together after this specification.

### 2026-11-26 22:15 EST — The safe operations of the service specification, and which are built

**Source.** The Project Owner's decision of 2026-11-26, carried by the lead agent's brief for Step 2 and by invariant 4 of `AGENTS.md`: fewer safe routes, and each service specification records which it left out.

**Changed sections.** The count in [§0](#0-capability); [§2, invariant 4](#2-invariants); [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not); [AC17](#6-acceptance-criteria); the reference-data note of [§7](#7-test-strategy).

**Rationale.** The service specification was designed with 29 safe operations for a ratio. Six of them are nobody's counterpart and serve no flow, no test and no scenario; two of the reads it offers cannot show what the scenario tests must read, because the GraphQL `Delivery` type has no `responseBody`.

**Summary.** 22 safe operations are built: 16 protected counterparts and 6 others, each with the thing that needs it named in [D-2](#d-2--twenty-two-safe-operations-are-built-and-six-are-not). Six are not: `deliveries` and `User.deliveries` (GraphQL), `updateNotificationSettings`, `importAlerts` (GraphQL), `GET /internal/announcements` and `POST /internal/announcements`. `GET /internal/deliveries` is built in their place for what the suites must read. The service specification's count of 29 was itself one above its own tables ([OQ-2](#10-open-questions)): they list 28.

**Verification impact.** [AC17](#6-acceptance-criteria) counts the files. The gateway's pass-through for the three REST routes not built has no upstream; the lead agent removes it or asks for the routes in Step 3.

---

*End of specification. Implementation proceeds from this specification and the run log; no separate execution document is created.*
