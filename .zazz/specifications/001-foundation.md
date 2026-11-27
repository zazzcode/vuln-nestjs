# Scaffolding — Deliverable Specification

**Worktree / branch:** `phase-1-foundation`
**Feature:** VCX, the deliberately vulnerable NestJS lab
**Milestone:** M1 — Running skeleton
**Deliverable:** Step 1, the scaffolding
**Project Owner:** @zazzcode
**Deliverable Owner:** @zazzcode
**Delivery topology:** single-deliverable branch
**Review artifact:** one PR for this specification
**Approved review shape:** one PR
**Decomposition rationale:** one PR, because nothing in it can be reviewed on its own: a library is only proven by the service that uses it, a service only by the gateway that composes it. Sibling PRs and a stack were rejected for the same reason. The result is a large diff, and the PR body groups it by area so that each area can be reviewed separately
**Integration branch:** `main`
**Merge policy:** PR review required — agents commit and push the feature branch only. The Project Owner merges
**Drafted:** 2026-11-26
**Shared run log:** `.zazz/ephemeral/001-foundation-run-log.md` (local only, ignored by Git)
**Execution tracking:** local run log only. `AGENTS.md` records that the repository has no work tracker
**Implementation coordination:** Lead Agent working alone. The four services are Step 2, one sub-agent each, after this PR lands
**Companion skills for implementation:** N/A

**Greenlight.** The Project Owner asked for the scaffolding in the session that produced the [handoff](#11-run-log-protocol) and then asked for this session to run unattended and resolve gaps on its own. That request is the approval to implement once this specification is pushed, and the pull request says so.

---

## 0. Capability

The repository skeleton. A pnpm workspace in which the four NestJS 12 applications start, each with its own store loaded with fake data, the gateway composes the three subgraphs and answers a query whose fields come from all three, and everything stops without leaving a database process or a temporary directory behind. The shared libraries, the three test suites, the ground-truth scripts, the launcher, the Postman collection and the CI workflow exist and have been run. **No scenario is added**: the catalogue is empty and the functional baseline audits clean, which is what makes every later advisory attributable to a pin.

---

## 1. Required Reading For The Implementor

Read these before opening an editor. Section-pinned, not whole documents.

### 1.a This Specification

Read this specification end to end first.

### 1.b Feature / Milestone Context

- [`.zazz/project/implementation-plan.md`](../project/implementation-plan.md) — §1 (who does what), §2 (what the scaffolding must contain), §7 (conventions), §8 (facts from the spike).
- [`.zazz/architecture/repository-layout.md`](../architecture/repository-layout.md) — §1 (shape), §3 (tooling and versions), §4 (conventions), §5 (root scripts).
- [`.zazz/architecture/service-communication.md`](../architecture/service-communication.md) — §3 (the graph), §4 (HTTP/2 and the `libs/http2` exports), §5 (internal REST contract), §6 (identity propagation), §8 (startup order).
- [`.zazz/architecture/data-architecture.md`](../architecture/data-architecture.md) — §1 (one store per service), §4 (data access), §8 (the fake data), §10 (reset).
- [`.zazz/architecture/project.md`](../architecture/project.md) — §7 (cross-cutting concerns: configuration, lifecycle), §10 (risks T2, T4, T7).
- [`.zazz/architecture/security-model.md`](../architecture/security-model.md) — §3 (safety rails), §4 (functional baseline).
- [`.zazz/architecture/testing-strategy.md`](../architecture/testing-strategy.md) — §2 (layers), §5 (ground truth), §6 (CI), §7 (definition of done).
- [`.zazz/project/scenario-catalog.md`](../project/scenario-catalog.md) — "Catalogue file schema".
- [`.zazz/project/requirements.md`](../project/requirements.md) — FR-6.1, 6.3 to 6.7, FR-7.1 to 7.4, 7.6, FR-8.7, FR-9.1, 9.3 to 9.5, NFR-1, NFR-6, NFR-7, NFR-9 to NFR-11.

### 1.c Prior Specifications In This Delivery Effort

N/A. This is the first deliverable specification. Step 0 was the plan and the [service specifications](../project/services/README.md), merged in [pull request 1](https://github.com/zazzcode/vuln-nestjs/pull/1).

### 1.d Standards

This repository has no `standards/` directory and no `standards/index.yaml`. [AGENTS.md](../../AGENTS.md) stands in for it: its invariants and its "repo-specific rules" are the standards for this specification.

**Verification step before writing code:** re-read the invariants and the repo-specific rules of `AGENTS.md`. They are restated in §2 and §5.

### 1.e Existing Code References

Nothing in this repository can run yet. Two references are read from outside it:

- `vuln-nextjs`, at commit `b97bfc7` on this machine's clone: `scripts/check-scenarios.mjs` and `scripts/check-audit.mjs` — the ground-truth design this lab carries over.
- `vuln-nextjs`, `pnpm-workspace.yaml` — `saveExact` and `allowBuilds`.

### 1.f Project Orientation

- [AGENTS.md](../../AGENTS.md) — invariants, branch scope, ownership of shared files, repo-specific rules.

---

## 2. Invariants

The ten invariants of `AGENTS.md` hold verbatim. Four of them are load-bearing for this step and are restated here.

### INVARIANT 1 — No scenario is added by the scaffolding

The catalogue starts empty. No vulnerable operation and no vulnerable dependency pin is installed on this branch. A service's functional baseline is written safely.

### INVARIANT 2 — Safety rails stay

Loopback only. Fake data. Harmless markers. No real credentials or files. No telemetry: `@nestjs/observe` is not installed, and neither is `@nestjs/mau`, the deployment CLI of the NestJS scaffold.

### INVARIANT 3 — Services never call each other

Only the gateway holds a client for a service. A lint rule fails a backend service that imports `@zazzles/exchange-http2`, and any application that imports another application.

### INVARIANT 4 — Generated ground truth is never hand-edited

`tests/expected-*.json` are written by `pnpm scenario:update` and `pnpm audit:update` only.

---

## 3. Scope

### Approved Review Shape

This specification is approved for **one PR**. If implementation surfaces a need to split, stack or combine, stop for Deliverable Owner sign-off, update this section in place, and record the change in §13.

**Rationale.** See the header. Every piece proves another: the libraries by the services, the services by the gateway, the gateway by the end-to-end suite.

**Review units owned by this specification.**

- One PR — the whole scaffolding. Acceptance boundary: §6. Evidence boundary: §7 and the pull request body.

### Strict Scope Constraint

Every file in this change is under the repository root, in the paths listed below. If implementation surfaces a need to modify a path that is not listed — in particular a service specification, a decision record or `SECURITY.md` — stop and surface it to the Deliverable Owner, or add it here and record it in §13.

### In Scope

| Path | New / Modified | Reason |
| --- | --- | --- |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | New | The workspace, exact pins, denied build scripts |
| `tsconfig.base.json`, `vitest.config.ts`, `vitest.config.e2e.ts` | New | Shared compiler options, the root unit and end-to-end runners |
| `.oxlintrc.json`, `.prettierrc`, `.prettierignore` | New | One lint and format configuration at the root |
| `.gitignore` | Modified | Build output of libraries, the Newman report |
| `libs/config/` | New | Typed environment, the service registry, the loopback assertion |
| `libs/lab-data/` | New | The fixed identifiers of the fake users, the markets' starting prices |
| `libs/graphql/` | New | The `Decimal`, `DateTime` and `JSON` scalars, the pagination limit |
| `libs/http2/` | New | The HTTP/2 fetch, the JSON client, the transport per service |
| `libs/internal-auth/` | New | Guards, decorators, the service-token check |
| `libs/testing/` | New | Start and stop one service or the whole lab from a test, call the graph |
| `apps/accounts/`, `apps/trading/`, `apps/notifications/`, `apps/gateway/` | New | Each application: `main.ts`, module, configuration, store, seed, health, the GraphQL module, one feature module, tests |
| `catalog/catalog.json`, `catalog/catalog.schema.json` | New | The empty catalogue and its schema |
| `scripts/` | New | The launcher, the scenario and audit checks and their unit tests |
| `tests/` | New | `e2e/`, the three `expected-*.json` snapshots, the manifest test |
| `postman/` | New | The collection and the environment |
| `.github/workflows/ci.yml` | New | CI |
| `docs/setup-and-testing.md`, `docs/README.md`, `docs/architecture.md`, `docs/vulnerabilities/index.md`, `docs/vulnerabilities/dependencies.md` | New or Modified | Setup and testing written from commands that ran; status lines that were made untrue |
| `README.md` | Modified | Status, setup and run, repository layout |
| `AGENTS.md` | Modified | "Repository commands", the library list in the ownership rule |
| `.zazz/specifications/README.md`, `.zazz/specifications/001-foundation.md` | New or Modified | The specification and its index |
| `.zazz/README.md`, `.zazz/project/README.md`, `.zazz/project/implementation-plan.md`, `.zazz/project/scenario-catalog.md` | Modified | What this change made untrue: the status of Step 1, the library list, the catalogue schema |
| `.zazz/architecture/README.md`, `.zazz/architecture/project.md`, `.zazz/architecture/repository-layout.md`, `.zazz/architecture/service-communication.md`, `.zazz/architecture/data-architecture.md`, `.zazz/architecture/testing-strategy.md` | Modified | Risks T2, T4, T7 closed (T2 through ADR-011). Versions confirmed. The test layer names. The library list |
| `.zazz/architecture/decisions/ADR-011-native-mongodb-driver-for-accounts.md`, `.zazz/architecture/decisions/README.md` | New / Modified | The decision that `accounts` uses the native MongoDB driver, and its index. Directed by the Project Owner during implementation: see §13 |
| `.zazz/project/services/*.md` | Modified | Only two things: the test-layer names in their "API tests" sections, to match §D-4, and one sentence in the accounts specification on how its store is reached, to match ADR-011. No operation, no scenario and no count changes |

### Out Of Scope

- Any vulnerable operation, any scenario, any catalogue entry. Step 2.
- Any vulnerable dependency pin, including the three that Step 2 installs with its services. Step 2 on the service's branch; Step 4 for the rest.
- Any operation of a [service specification](../project/services/README.md) beyond the one feature module each service needs as its pattern. Step 2.
- The gateway's pass-through controllers, its status and ticker pages, its OpenAPI document, CORS, CSRF, its exception filter. Step 2.
- The full fake data of [data-architecture §8](../architecture/data-architecture.md#8-the-fake-data). One entity per service is seeded here. Step 2.
- The Postman folders per service and the requests per scenario. Step 3.
- `WEBHOOK_ALLOWED_ORIGINS`, `PARTNER_ORIGINS` and `REDIRECT_ORIGINS`. Each service reads them when Step 2 gives it a reason to.
- Persistence, retries, metrics, tracing, health probes of a running system. [ADR-004](../architecture/decisions/ADR-004-ephemeral-stores.md).

---

## 4. Decisions

Each answers "why this over the obvious alternative?"

### D-1 — Applications as the CLI produces them; libraries as compiled packages

**Decision.** Each application is what `nest new` produces — its own `package.json`, `nest-cli.json`, `tsconfig.json` — plus the lab's additions. Each library is a small workspace package with `"exports"` pointing at its compiled `dist/`. `pnpm build` builds libraries before applications, in workspace order. Vitest resolves `@zazzles/exchange-*` to the libraries' TypeScript sources, never to `dist/`.

**Why.** An application imports a library by package name, which Node resolves under ESM without a bundler. Loading the TypeScript sources at run time is not possible: Node strips types but does not transform decorators, which is what Nest's injection needs. Tests, however, must not depend on a build: a stale `dist/` would let a test pass against yesterday's library.

### D-2 — Automatic peer installation is off

**Decision.** `autoInstallPeers: false` in `pnpm-workspace.yaml`. Every peer a workspace needs is declared in its own `package.json`.

**Why.** `@nestjs/core` declares `@nestjs/platform-express` as a required peer, so pnpm would install Express into the three Fastify services. The lab attributes a dependency finding to a service, and shows the two adapters side by side. An Express adapter in `apps/trading` blurs both. The cost is one install warning per Fastify workspace, which is honest: Nest's core names that peer and the lab deliberately does not satisfy it.

### D-3 — What is left out of the scaffold

**Decision.** `@nestjs/observe` (telemetry), `@nestjs/mau` (the CLI that deploys to the Mau cloud), the scaffold's own `AGENTS.md` and `README.md`, and `source-map-support`, which the generated code does not use.

**Why.** The lab sends no telemetry and is never deployed. This repository has its own `AGENTS.md`. An unused dependency is noise for a dependency scanner and for a reader.

### D-4 — One name for each test layer

**Decision.** Three patterns, three commands.

| Layer | Files | Command |
| --- | --- | --- |
| Unit | `*.spec.ts` beside the code, under `src/` | `pnpm test` |
| Integration: one service, its own store, `app.inject()` or its real port | `apps/<service>/test/**/*.int-spec.ts` | `pnpm test:int` |
| End to end: the whole lab | `tests/e2e/*.e2e-spec.ts` | `pnpm test:e2e` |

**Why.** The testing strategy names a fourth layer, "Service API", in `test/api/*.spec.ts`, which differs from the integration layer only in whether the request goes through a real port. The repository layout, the catalogue example and the implementation plan name three. Four names for three kinds of test guarantee that a file lands in the wrong suite, and `*.spec.ts` under `test/` would be collected by the unit runner. The "Service API" layer is kept as a description of what an integration file may do, and the documents are updated to say so.

### D-5 — A sixth library: `libs/graphql`

**Decision.** `@zazzles/exchange-graphql` holds the `Decimal`, `DateTime` and `JSON` scalars and the pagination limit (default 50, cap 200).

**Why.** Every subgraph must define the same scalar with the same behaviour, or a value serialised by one service is refused by another. Three copies of the class drift, and the drift would appear only at the gateway. The plan lists five libraries; this is the sixth, and the one place the shared conventions of the service specifications are code.

### D-6 — Guards and pipes are providers, not `main.ts` calls

**Decision.** The authentication guard, the roles guard and the global `ValidationPipe` are registered as `APP_GUARD` and `APP_PIPE` providers.

**Why.** `app.useGlobalGuards()` in `main.ts` applies only to an application created through `main.ts`. A test that builds the application from its module would run without the guards unless it repeated the registration, which is how an authorization test passes against an unguarded application. Providers travel with the module.

### D-7 — Fixed identifiers; reset recreates, empties and reloads

**Decision.** Seeded records carry the fixed identifiers of `libs/lab-data`. In the relational stores, reset is `synchronize`, then `clear` of every entity, then the seed module. In `accounts`, reset drops and recreates each collection with its indexes, then runs the seed module.

**Why.** A scanner must see the same target on every run (NFR-4). An identifier minted by the store changes after a reset, and a MySQL auto-increment counter survives a `DELETE`. `synchronize` first because a scenario is allowed to drop a table, and reset has to undo that.

### D-8 — Reset on a service needs the service token; health is open

**Decision.** `GET /internal/health` is `@Public()`. `POST /internal/lab/reset` requires `x-internal-token`. The gateway's `POST /api/v1/lab/reset` is open, and presents the token.

**Why.** Reset is destructive, and the architecture says a call made on the system's behalf presents the token. The launcher needs no credential, and should hold none: it only reads health.

### D-9 — The lab starts in a test process, and in separate processes

**Decision.** `libs/testing` starts the four modules in the test process for the end-to-end suite. `scripts/start.mjs` starts the four built entry points as separate processes for a person, a scanner and Newman. Both use the same environment contract.

**Why.** In-process, a test can read what the services observed — the protocol of each request, the temporary directories — without a debugging endpoint. Separate processes prove the entry points a person actually runs. One mechanism cannot do both.

### D-10 — The three unknowns are proven before anything is built on them

**Decision.** In this order, each in a throwaway project outside the repository: the code-first generator with TypeScript 6; the native `mongodb` driver against `mongodb-memory-server`, with one collection and a fixed string `_id`; `mysql-memory-server`. Each result goes into the pull request as soon as it is known.

**Why.** A fallback changes the shape of everything after it. The fallbacks that remain are the plan's: TypeScript 5.9.3, and a generous timeout for the trading tests. The second unknown was TypeORM against MongoDB until the Project Owner decided [D-15](#d-15--accounts-uses-the-native-mongodb-driver).

### D-11 — A written validator, and a named retirement

**Decision.** `scripts/check-scenarios.mjs` validates the catalogue itself, against the rules the lab depends on; `catalog/catalog.schema.json` is the reference a reader and an editor use. `pnpm audit:update --retire <id>[,<id>…]` refuses to remove an advisory from the snapshot that was not named.

**Why.** No schema library is added for one script: a dependency that exists only to check a file is another entry in every audit. The retirement rule is in the testing strategy and the decision record; the script it was carried over from does not implement it.

### D-12 — One lint and format configuration, scoped to code

**Decision.** A root `.oxlintrc.json` and `.prettierrc`. Prettier formats `apps/`, `libs/`, `scripts/`, `tests/`, `catalog/`, `postman/` and the root configuration files. It does not format Markdown.

**Why.** Nine copies of a lint configuration become nine configurations. The documentation under `.zazz/` and `docs/` is hand-formatted Markdown with tables; reformatting it would bury this change under noise.

### D-13 — CI is three jobs

**Decision.** `test` (install, static, unit, integration, build, end to end, Newman), `ground-truth` (`scenario:check`, `audit:check`) and `audit` (the raw audit, never blocking). Every job that starts the lab checks afterwards that no `mongod` or `mysqld` is left.

**Why.** The testing strategy requires the audit to be visible without stopping the tests, and the ground truth to be its own job. Splitting the rest into six jobs would pay six installs to gain nothing: the steps share one cache of database binaries and run in a minute or two.

### D-14 — The clean stop is asserted from outside

**Decision.** Before the lab starts, `libs/testing` records the `mongod` and `mysqld` processes and the temporary directories the two memory-server packages create. After it stops, both sets must be what they were.

**Why.** The assertion does not depend on what each store chooses to expose, works for the in-process lab and for `pnpm start`, and is not confused by a database the machine already runs.

### D-15 — `accounts` uses the native MongoDB driver

**Decision.** `accounts` reaches MongoDB through the native `mongodb` driver, with documents as plain JSON. `typeorm` and `@nestjs/typeorm` are not dependencies of `apps/accounts`. `trading` and `notifications` stay on TypeORM.

**Why.** The Project Owner decided it on 2026-11-26, during implementation: [ADR-011](../architecture/decisions/ADR-011-native-mongodb-driver-for-accounts.md). It removes the proof the plan asked for, and the rework a failed proof would have caused in the middle of Step 2, and it puts the NoSQL scenarios in the driver's own language.

---

## 5. Agent Implementation Rules

### Team Integration

Commit and push only to `phase-1-foundation`. Do not merge to `main`. The Project Owner merges.

### Command Working Directory

Every command is run from the repository root unless `docs/setup-and-testing.md` says otherwise.

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm format:check
pnpm test && pnpm test:int
pnpm build && pnpm test:e2e
pnpm scenario:check && pnpm audit:check
```

### Commit And Push

The standing instruction of the Project Owner overrides the template's default: **commit and push at every checkpoint, not only at the end.** A checkpoint is a verified piece — the specification; the workspace root with `pnpm install` green; each library with its unit tests green; each application with its integration test green; the end-to-end suite green; CI green; the documentation. Each commit is green on its own, its message follows Conventional Commits, and its body says why. Each proven unknown is reported in the pull request the moment it is known.

### Scope Verification

`git diff main --stat` lists exactly the paths in §3. `git diff main --stat | grep -v -E '^( apps/| libs/| scripts/| tests/| postman/| catalog/| docs/| \.zazz/| \.github/)'` must show only the root files named in §3.

### Autonomy Boundaries

Hard constraints:

- Scope in §3 and the review shape.
- The invariants in §2.
- Public contracts: the scripts of [repository-layout §5](../architecture/repository-layout.md#5-root-scripts); the ports and environment variables of [project.md §7](../architecture/project.md#7-cross-cutting-concerns); the `/internal/*` contract of [service-communication §5](../architecture/service-communication.md#5-internal-rest-contract); the three `tests/expected-*.json` file names; the package names.
- Acceptance criteria in §6. Halt conditions below.

Adaptive guidance:

- File names inside a library or a feature module, helper names, test organisation, the bodies in §8.

This session runs unattended. An open question is resolved by its default, and the resolution is recorded in the run log and listed in the pull request for the Project Owner to overrule.

### Run Log

Maintain `.zazz/ephemeral/001-foundation-run-log.md`. Append after each open-question resolution, each proven unknown, each phase completion, each deviation. Never rewrite an entry.

### Execution Tracking

The run log and the pull request are the record.

- **Authoritative record:** the pull request, with its acceptance-criteria checklist.
- **Fallback:** the run log, if the pull request cannot be reached.

### Lead Agent / Contributor Agent Coordination

The Lead Agent implements alone. The only delegation is the verifier in §12, which changes nothing.

| Phase / task | Responsible agent | Allowed scope | Required evidence |
| --- | --- | --- | --- |
| §8, phases 0 to 6 | Lead Agent | §3 | Commands and results in the run log and the PR |
| Verification | Verifier Agent | Read and run only | PASS or FAIL per criterion |

### Independent QA / Verification Agents

One fresh-context Verifier Agent after the definition of done is met. Its prompt is in §12.

### Halt Conditions

Stop and surface to the Project Owner if any of these occur:

1. Scope verification shows a path outside §3.
2. Implementation needs to modify a service specification's operations, scenarios or counts, a decision record, `SECURITY.md`, or a repository setting.
3. The same automated test fails three times in a row for a reason not understood.
4. A fallback from D-10 is needed *and* it changes a public contract: the TypeScript version, a package name, a script name, the lockfile's ability to install frozen.
5. The baseline audit is not clean, and the advisory is not in a package this specification can change.
6. A change would break an invariant of `AGENTS.md`.
7. Any write outside the repository other than the throwaway project of phase 0, the package-manager caches, and the two database binaries.

"Surface" in an unattended session means: stop that line of work, record it in the run log, and continue with what does not depend on it.

---

## 6. Acceptance Criteria

- **AC1 — Install, pinned.** From a clean clone, with Node 24.11 or later and pnpm 12.23.0, `pnpm install --frozen-lockfile` exits 0 and no install script runs. Every dependency in every `package.json` is an exact version or a `workspace:` reference. No manifest contains `@nestjs/observe` or `@nestjs/mau`. `apps/accounts` depends on neither `typeorm` nor `@nestjs/typeorm`. Verified by: `pnpm install --frozen-lockfile` and `tests/manifests.spec.ts`.
- **AC2 — Static checks.** `pnpm lint` (oxlint, type-aware) and `pnpm format:check` exit 0. A file under `apps/accounts/` that imports `@zazzles/exchange-http2`, or `apps/accounts/` that imports from `apps/trading/`, fails `pnpm lint`. Verified by: the two commands, and one run of each violation recorded in the pull request.
- **AC3 — Libraries.** `pnpm build` builds the six libraries before any application, and each library has a passing unit test. Verified by: `pnpm build && pnpm test`.
- **AC4 — Every service starts alone.** For each of `accounts`, `trading`, `notifications`: started with its own store on its own port, `GET /internal/health` answers `200` with `status: "ok"`, the service's name and its store as connected; the listener's address is exactly `127.0.0.1`; a GraphQL query against the service's own `/graphql` returns the seeded record. Verified by: `apps/<service>/test/app.int-spec.ts`, run by `pnpm test:int`.
- **AC5 — Authentication on both surfaces.** In `accounts`, `user(id)` refuses a request with no token with `extensions.code` `UNAUTHENTICATED`, refuses a `USER` token with `FORBIDDEN`, and answers an `ADMIN` token with the seeded user. `GET /internal/users` answers `401` and `403` in the same cases and `200` for the administrator. Verified by: `apps/accounts/test/app.int-spec.ts`.
- **AC6 — Federation.** The gateway composes the three subgraphs at start and answers, in one query, fields owned by each of the three services. A query for an order's `user { id email }` is answered from `trading` and `accounts` together, through an entity reference that carries `@provides(fields: "id")`. Verified by: `tests/e2e/graph.e2e-spec.ts`.
- **AC7 — Transports.** Requests the gateway sends reach `accounts` and `trading` as `HTTP/2.0` and `notifications` as `HTTP/1.1`. A client's own request reaches the gateway as `HTTP/1.1`. Verified by: `tests/e2e/transport.e2e-spec.ts`.
- **AC8 — Header forwarding.** A bearer token sent to the gateway reaches the service that owns the field: the same query answers `UNAUTHENTICATED` without a token and succeeds with one. Verified by: `tests/e2e/graph.e2e-spec.ts`.
- **AC9 — Health.** `GET /api/v1/health` answers `200` with one entry per service and its store, and no key that names a version or holds an environment value. Verified by: `tests/e2e/lab.e2e-spec.ts`.
- **AC10 — Reset.** After seeded data is changed, `POST /api/v1/lab/reset` answers `200` with one status per service, and every store holds exactly the fake data it held at start, identifiers included. A service that fails to reset is reported by name. Verified by: `tests/e2e/lab.e2e-spec.ts` and `apps/gateway/test/lab.int-spec.ts`.
- **AC11 — Clean stop.** After the end-to-end suite stops the lab, and separately after `pnpm start` is sent `SIGINT`, no `mongod` or `mysqld` process and no temporary directory of the two memory-server packages remain that were not there before. Verified by: the end of `tests/e2e/global-setup.ts`, which fails the run, and one recorded run of `pnpm start` interrupted with Ctrl-C.
- **AC12 — Secrets of a run.** `pnpm start` gives all four processes a `JWT_SECRET` and an `INTERNAL_SERVICE_TOKEN` generated for that run, and writes neither to disk. A service started without either refuses to listen. Verified by: `scripts/start.spec.ts` and `libs/config/src/environment.spec.ts`.
- **AC13 — Ground truth.** `pnpm scenario:check` exits 0 against the committed snapshots and fails on a catalogue with a duplicate identifier, an entry whose `source` does not exist, and an entry with neither a counterpart nor a hardened value. `pnpm scenario:update` leaves the committed files byte-identical. `pnpm audit:check` exits 0. `pnpm audit:update --retire <id>` exits 1 when the audit no longer reports an advisory the snapshot holds and the advisory was not named. Verified by: the commands, and `scripts/check-scenarios.spec.ts` and `scripts/check-audit.spec.ts`.
- **AC14 — One command per suite.** `pnpm test`, `pnpm test:int`, `pnpm test:e2e` and `pnpm test:api` each exit 0, `test:api` against a running stack. Verified by: the four commands.
- **AC15 — The launcher.** `pnpm start` builds what is missing, starts the three backend services, waits for each `/internal/health`, then starts the gateway and waits for `/api/v1/health`. Interrupted, it stops the gateway first and exits 0. Verified by: a recorded run.
- **AC16 — The three unknowns.** (a) The code-first generator produces a federation schema with TypeScript 6.0.3, or the fallback is applied and recorded. (b) The native `mongodb` driver creates, reads, updates and deletes one real `accounts` document with a fixed string `_id`, in a `mongod` that `mongodb-memory-server` started, and `apps/accounts` does not depend on TypeORM. (c) `mysql-memory-server` starts on this machine: the download size and the start time on a warm cache are recorded. Verified by: AC4 for (b) and (c); `apps/accounts/test/schema.int-spec.ts` for (a); the measurements in the pull request and in [repository-layout §3](../architecture/repository-layout.md#3-tooling-and-versions).
- **AC17 — CI.** `.github/workflows/ci.yml` runs on pull requests and on `main`: install, static, unit, integration, build, end to end, Newman, the audit as information, the ground truth in its own job. Verified by: a green run on this pull request.
- **AC18 — Documentation.** `docs/setup-and-testing.md` exists and every command in it was run before it was written. `AGENTS.md` "Repository commands" names the commands that exist. Verified by: review against the run log.
- **AC19 — Scope clean.** `git diff main --stat` lists exactly the paths in §3. Verified by: the command in §5.

---

## 7. Test Strategy

Test value rule: every automated test below proves an acceptance criterion, an invariant or a named risk. No test asserts only that a function was called.

Test contract rule: the intent of each test is the contract. Names and mechanics may adapt to the repository. Coverage may not be weakened to make an implementation pass.

Reference data sources:

- `libs/lab-data` — the administrator and five users, the five markets. Created by this step. The only source of fake data.
- `catalog/catalog.json` — empty. Negative cases for the validator are built in the test, in memory.
- `tests/expected-audit.json` — generated by `pnpm audit:update` from the registry on the day of the run.

### Unit (`pnpm test`)

| Test | Proves | Asserts |
| --- | --- | --- |
| `libs/config/src/environment.spec.ts` | AC12 | A missing `JWT_SECRET` or `INTERNAL_SERVICE_TOKEN` throws with the variable's name in the message. Port variables fall back to 3000, 3101, 3102, 3103. A port that is not a number is refused |
| `libs/config/src/loopback.spec.ts` | AC4, NFR-1 | `assertLoopbackListener` accepts `{ address: "127.0.0.1" }` and throws for `0.0.0.0`, `::` and a non-loopback address |
| `libs/http2/src/http2-fetch.spec.ts` | AC6, AC7 | Against a local `http2.createServer` on an ephemeral port: status, headers and body come back; a `POST` body arrives; an abort rejects the call |
| `libs/http2/src/service-client.spec.ts` | AC6 | A fetcher that does not answer within the timeout throws `ServiceUnavailableException`; the transport of a service comes from the registry |
| `libs/internal-auth/src/auth-guard.spec.ts` | AC5, AC8 | A table of cases through the guards with a fabricated context: no token, expired token, a token signed with another algorithm, a valid token, `@Public()`, `@Roles("ADMIN")` with a `USER` token, the service-token check with a wrong and the right value |
| `libs/lab-data/src/lab-data.spec.ts` | AC10 | Six users with unique identifiers and emails; one `ADMIN`; five markets; every starting price is a decimal string |
| `libs/graphql/src/scalars.spec.ts` | AC6 | `Decimal` and `DateTime` serialise to strings and refuse values they cannot round-trip; `JSON` accepts an object; the limit defaults to 50, is capped at 200 and never below 1 |
| `apps/*/src/**/*.spec.ts` | AC3 | One per application, on the feature module's service with a fabricated repository: a found record, a record that is not there |
| `scripts/start.spec.ts` | AC12, AC15 | `generateRunSecrets()` returns two different 64-character hex strings, different on every call. `nextStartupStep` advances backends → gateway → ready and never skips the health wait |
| `scripts/check-scenarios.spec.ts` | AC13 | The three rejections of AC13; the committed catalogue passes; the scanner export carries one `expectedFinding: true` row and one `false` row per counterpart |
| `scripts/check-audit.spec.ts` | AC13 | A new advisory is added by an update; an advisory that disappears is refused unless named in `--retire`; identical output passes |
| `tests/manifests.spec.ts` | AC1, INVARIANT 2 | Every dependency is exact or `workspace:`; no telemetry or deployment package; `packageManager` is `pnpm@12.23.0`; every workspace sets `"type": "module"`; `apps/accounts` has no ORM package |

`libs/testing` is proven by every integration and end-to-end file. It has no unit test of its own, by design: a test of a test helper asserts nothing a reader cares about.

### Integration (`pnpm test:int`)

| Test | Proves | Asserts |
| --- | --- | --- |
| `apps/accounts/test/app.int-spec.ts` | AC4, AC5, AC16(b) | The service starts on `127.0.0.1:3101` with a `mongod` it started itself. Health. `user(id)` for the three callers. `GET /internal/users` for the three callers. A record written through a repository is read back with its fixed string identifier |
| `apps/accounts/test/schema.int-spec.ts` | AC16(a) | The generated schema file declares `type User @key(fields: "id")` and `scalar Decimal` |
| `apps/trading/test/app.int-spec.ts` | AC4, AC16(c) | The service starts on `127.0.0.1:3102` with a `mysqld` it started itself. Health. `orders` returns the seeded orders with `user { id }` |
| `apps/notifications/test/app.int-spec.ts` | AC4 | The service starts on `127.0.0.1:3103` with SQLite in memory. Health. `announcements` returns the seeded announcement |
| `apps/gateway/test/lab.int-spec.ts` | AC10 | Through `app.inject()`, with the internal client replaced by `vi.fn()`: health merges what the three services answered; reset reports a status per service; one refusal is reported by that service's name |

Each of the three backend files also proves the stop: the database footprint is taken before the start and compared after `app.close()`.

### End to end (`pnpm test:e2e`)

| Test | Proves | Asserts |
| --- | --- | --- |
| `tests/e2e/graph.e2e-spec.ts` | AC6, AC8 | One query with fields from the three services. An order's `user { id email }`. The token forwarded |
| `tests/e2e/transport.e2e-spec.ts` | AC7 | The protocols the four listeners recorded |
| `tests/e2e/lab.e2e-spec.ts` | AC9, AC10 | The shape of health. A changed row is back after reset, with its identifier |

`tests/e2e/global-setup.ts` proves AC11: it takes the footprint before the start and compares it after the stop.

### Newman (`pnpm test:api`)

`postman/vuln-nestjs.postman_collection.json` holds the requests of the Step 1 surface: health, reset, one query through the gateway. Each carries a test script that asserts its marker. Later steps add a folder per service and a request per scenario.

### Manual verification

- `pnpm start`, a request by hand, Ctrl-C, then the check that no database process remains (AC11, AC15). Recorded in the pull request.
- The two lint violations of AC2, each run once and removed.

### Existing coverage intentionally reused

None. Nothing existed.

---

## 8. TDD Entry Point + Prescriptive Execution Sequence

The sequence is derived from §6 and §7.

### TDD Entry Point

The first test that must fail, then pass:

```ts
// libs/config/src/environment.spec.ts
it('refuses to start without JWT_SECRET', () => {
  expect(() => loadEnvironment({ INTERNAL_SERVICE_TOKEN: 't'.repeat(32) })).toThrow(/JWT_SECRET/);
});
```

### Prescriptive Execution Sequence

Follow this order unless verified local evidence shows a safer one. Log each deviation.

**Phase 0: The three unknowns, in a throwaway project outside the repository**

0.1. A workspace with TypeScript 6.0.3 and one code-first federation subgraph on `FastifyAdapter({ http2: true })`. Run it. Expect a schema with `@key`, and a type error if the generator cannot read TypeScript 6 output.
0.2. `mongodb` 7.9.1 and `mongodb-memory-server` 11.4.0: one collection whose documents have a fixed string `_id`, inserted, found, updated and deleted through the driver; a unique index enforced; the collection dropped and recreated with its index.
0.3. `mysql-memory-server` 1.18.0: the time to download, the size of the download, the time to start on a warm cache, and a clean stop. The same measurements for `mongod`.
0.4. Record each result in the pull request and in the run log. Remove the throwaway directory.

**Phase 1: The workspace root**

1.1. `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.oxlintrc.json`, `.prettierrc`, `.prettierignore`, the Vitest configurations.
1.2. Run: `pnpm install`. Expect `ERR_PNPM_IGNORED_BUILDS` once, naming the packages that want a script; deny each; expect success.
1.3. Run: `pnpm lint`. Expect exit 0 on an empty tree.

**Phase 2: The libraries, each with its unit test first**

2.1. `libs/config`, `libs/lab-data`, `libs/graphql`.
2.2. Run: `pnpm test`. Expect green.
2.3. `libs/http2`, `libs/internal-auth`, `libs/testing`.
2.4. Run: `pnpm test && pnpm build`. Expect green.

**Phase 3: The applications, each started alone**

3.1. `accounts`: store, seed, health, GraphQL module, the `users` module. Run `pnpm --filter @zazzles/exchange-accounts test:int`. Expect green. This is the real proof of unknown (b).
3.2. `trading`, in the same order, with `orders`. Then `notifications`, with `announcements`.
3.3. `gateway`: the GraphQL module with `IntrospectAndCompose`, the data source, health, reset.
3.4. Commit and push after each.

**Phase 4: The end-to-end suite and the launcher**

4.1. `tests/e2e/global-setup.ts` on `libs/testing`. Run `pnpm test:e2e`. Expect green, and a failed run if the stop assertion is made to fail once.
4.2. `scripts/start.mjs`. Run it, interrupt it, check the footprint.

**Phase 5: Ground truth, Newman, CI**

5.1. `catalog/`, the two scripts and their unit tests. Run the five commands of AC13.
5.2. `postman/`. Run `pnpm test:api` against the running stack.
5.3. `.github/workflows/ci.yml`. Watch the run on the pull request.

**Phase 6: Documentation and verification**

6.1. `docs/setup-and-testing.md`, from the run log. `AGENTS.md`. The durable documents of §3.
6.2. The verifier of §12. Mark the pull request ready.

### Skeletons

Adaptive guidance. The signatures are the contract between a library and its four users.

#### `libs/config/src/index.ts`

```ts
export const LOOPBACK_HOST = '127.0.0.1';

export const services = {
  gateway:      { port: 'GATEWAY_PORT',      defaultPort: 3000, transport: 'http1' },
  accounts:     { port: 'ACCOUNTS_PORT',     defaultPort: 3101, transport: 'http2' },
  trading:      { port: 'TRADING_PORT',      defaultPort: 3102, transport: 'http2' },
  notifications: { port: 'NOTIFICATIONS_PORT', defaultPort: 3103, transport: 'http1' },
} as const;

// Throws, naming every variable that is missing or malformed.
export function loadEnvironment<T extends object>(environment: Record<string, string | undefined>): T;

// Throws unless the address is 127.0.0.1.
export function assertLoopbackListener(address: AddressInfo | string | null): void;
```

#### `libs/http2/src/index.ts`

```ts
// The WHATWG fetch signature over node:http2. One session per origin, closed on shutdown.
export class Http2ClientService implements OnApplicationShutdown {
  fetch(url: string | URL, init?: RequestInit): Promise<Response>;
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, init?: { body?: unknown; headers?: Record<string, string> }): Promise<T>;
  onApplicationShutdown(): Promise<void>;
}

// The transport a service speaks, from the registry: HTTP/2 for accounts and trading.
export function fetcherFor(client: Http2ClientService, service: keyof typeof services): FetcherLike;

// 10 seconds, then ServiceUnavailableException.
export function withTimeout<T>(call: (signal: AbortSignal) => Promise<T>, ms?: number): Promise<T>;
```

#### `libs/internal-auth/src/index.ts`

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const SERVICE_TOKEN_KEY = 'serviceToken';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const ServiceToken = () => SetMetadata(SERVICE_TOKEN_KEY, true);
export const CurrentUser = createParamDecorator((_data, context) => userOf(context));

// Global. Reads `authorization: Bearer …`, else the `vcx_session` cookie.
// Verifies HS256 with the algorithms pinned. Attaches { sub, sid, role } to the request.
export class AuthGuard implements CanActivate { /* … */ }

// Global. Refuses a role the token does not carry.
export class RolesGuard implements CanActivate { /* … */ }
```

#### `libs/testing/src/index.ts`

```ts
export interface ServiceOptions {
  module: Type<unknown>;
  adapter: AbstractHttpAdapter | undefined; // the adapter its service uses
  port: number;
}

// Starts one service, waits for /internal/health or /api/v1/health, records the protocol of every request.
export async function startService(options: ServiceOptions): Promise<ServiceHandle>;
export async function stopService(handle: ServiceHandle): Promise<void>;

export async function startLab(services: Record<'gateway' | 'accounts' | 'trading' | 'notifications', ServiceOptions>): Promise<LabHandle>;
export async function stopLab(lab: LabHandle): Promise<void>;

export function databaseFootprint(): Promise<{ pids: number[]; directories: string[] }>;
export function assertFootprintGone(before: Awaited<ReturnType<typeof databaseFootprint>>): Promise<void>;

// A token for a fake user, signed with the run's secret.
export function sessionToken(secret: string, claims: { sub: string; sid: string; role: 'ADMIN' | 'USER' }): string;
export function graphql(url: string, query: string, options?: { variables?: Record<string, unknown>; token?: string }): Promise<GraphQLResponse>;
```

#### `apps/<service>/src/main.ts`

```ts
await bootstrap(); // as the scaffold writes it
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ http2: true }));
  await app.listen(loadEnvironment(process.env).port, LOOPBACK_HOST);
  assertLoopbackListener(app.getHttpServer().address());
}
```

#### A store, as in `apps/accounts/src/database/mongo.store.ts`

```ts
@Injectable()
export class MongoStore implements OnApplicationShutdown {
  private starting?: Promise<{ uri: string; dbName: string }>;
  start(): Promise<{ uri: string; dbName: string }> { /* idempotent */ }
  async reset(): Promise<void> { /* drop and recreate each collection and its indexes, run the seed */ }
  async onApplicationShutdown(): Promise<void> { /* close the data source, stop mongod */ }
}
```

#### The gateway's data source

```ts
export class SubgraphDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }: WillSendRequestOptions) {
    // authorization and cookie, and nothing else
  }
}
```

---

## 9. Definition Of Done

- [ ] All §1 required reading consumed; the `AGENTS.md` rules verified in place of a standards index.
- [ ] All §10 open questions resolved by their default or by the Project Owner, and logged.
- [ ] Scoped tests green: `pnpm test`, `pnpm test:int`, `pnpm test:e2e`, `pnpm test:api`.
- [ ] Manual verification complete: `pnpm start` interrupted; the two lint violations.
- [ ] `pnpm lint` and `pnpm format:check` exit 0.
- [ ] `pnpm scenario:check` and `pnpm audit:check` exit 0.
- [ ] Scope verification lists exactly the paths in §3.
- [ ] PR shape matches the approved review shape in §3.
- [ ] All AC1–AC19 verified, with evidence cited.
- [ ] The run log is up to date.
- [ ] Verifier sub-agent dispatched and returned all-pass.
- [ ] PR body links this specification and lists each AC's verification.

---

## 10. Open Questions

Resolved by default for this unattended session. Each is listed in the pull request for the Project Owner to overrule.

- **OQ-1 — The base branch.** The handoff asked whether pull request 1 would be merged first. **Resolved:** it was merged at 17:25 UTC on 2026-11-26. The base is `main`.
- **OQ-2 — Which service uses the Express adapter.** Never named by the Project Owner. **Default kept:** `notifications`.
- **OQ-3 — A decimal library.** The trading specification asks for one with an explicit rounding mode and names none. **Default:** `decimal.js` 10.6.0.
- **OQ-4 — Versions the plan does not list.** `@nestjs/swagger`, the `@fastify/*` plugins, `cookie-parser`, the type packages, `vite`, `oxlint`. **Default:** the latest release on 2026-11-26 inside every declared peer range, pinned exactly and recorded in the repository layout.
- **OQ-5 — Who merges.** The handoff says the lead agent merges each service. `AGENTS.md`, the implementation plan and the vendored `spec-builder` skill say the Project Owner merges. **Default:** the committed documents win. Nothing is merged by an agent. If Step 1 is not merged when Step 2 starts, its four branches are cut from `phase-1-foundation` and their pull requests target that branch.
- **OQ-6 — The three pins of Step 2.** The handoff wants them installed in Step 2, and also wants no sub-agent to change the lockfile. **Default:** they are installed on the branch of the service that needs them, as that branch's second commit, by an exact command the lead agent supplies. This branch stays clean.
- **OQ-7 — Where the catalogue schema lives and what it allows.** **Default:** `catalog/catalog.schema.json`, the fields of the catalogue document plus `hardenedValue`, which the five settings without a counterpart must carry.
- **OQ-8 — How `accounts` reaches MongoDB.** The plan asked the scaffolding to prove TypeORM against it. **Decided by the Project Owner on 2026-11-26:** the native driver, with no object-relational mapping in `accounts`. [D-15](#d-15--accounts-uses-the-native-mongodb-driver), [ADR-011](../architecture/decisions/ADR-011-native-mongodb-driver-for-accounts.md).

---

## 11. Run Log Protocol

This specification uses the run log `.zazz/ephemeral/001-foundation-run-log.md`. It is under `.zazz/ephemeral/`, which Git ignores: it exists only on the machine that wrote it, and the pull request carries everything in it that matters.

The agent appends; it does not rewrite. Required sections: Standards Verification, OQ Resolutions, Phase Completions, Deviations, Manual Evidence Locations, QA Findings & Rework, Issues & Recoveries, Verifier Sub-Agent Report.

Session start protocol:

1. Read this specification end to end.
2. Read the run log in full. If it is missing, this machine is not the one that wrote it: rebuild the state from `git log main..phase-1-foundation` and the pull request.
3. Confirm the next phase from the most recent Phase Completion entry.
4. Begin.

---

## 12. Agent Implementation Prompt

Paste this into a fresh implementation session:

```text
You are starting fresh in the worktree at /Users/michael/Dev/zazzcode/vuln-nestjs, on
branch phase-1-foundation. Your task is to implement Step 1 of vuln-nestjs, the scaffolding.

Specification: .zazz/specifications/001-foundation.md
Run log: .zazz/ephemeral/001-foundation-run-log.md (local only)
Execution tracking: local run log and the pull request only
Implementation coordination: Lead Agent working alone
Companion skills to load: none

Read AGENTS.md first: its invariants override everything else. Then read the specification
end to end, then the run log.

WHAT THIS REPOSITORY IS
A deliberately vulnerable NestJS application built to test vulnerability scanners. The
flaws are the product: never fix one. This step adds none. It is a sample that is started,
preloaded with fake data, exercised and stopped: nothing that matters only for an
application that stays up belongs in it.

NON-NEGOTIABLE RULES
1. Commit and push to phase-1-foundation only, at every checkpoint. Never merge.
2. Resolve an open question by its default, record it, and continue.
3. Every AC must have evidence. A command goes into the documentation only after it ran.
4. No telemetry package, no deployment package, no vulnerable pin, no vulnerable operation.
5. Every listener binds 127.0.0.1. Prove the clean stop.
6. Generated ground truth is never edited by hand.
7. Follow the halt conditions in §5 of the specification.

ORDER OF WORK
1. Read: AGENTS.md, the specification, the run log, the required reading of §1.
2. Execute §8, phases 0 to 6.
3. Run verification and complete §9.
4. Dispatch the verifier below.
5. Mark the pull request ready for review.

VERIFIER SUB-AGENT
After your own DoD checklist is green, dispatch a fresh sub-agent:

  "You are verifying Step 1 of vuln-nestjs in /Users/michael/Dev/zazzcode/vuln-nestjs on
  branch phase-1-foundation. Read AGENTS.md and the specification at
  .zazz/specifications/001-foundation.md. For each acceptance criterion AC1 to AC19,
  independently verify it by running the cited test or command. Confirm with
  `git diff main --stat` that the change matches the scope in §3. Check each invariant of
  AGENTS.md against the diff. Do not modify any file. Return PASS or FAIL per criterion
  with the evidence you saw."

Only declare done after the verifier reports all-pass.
```

---

## 13. Implementation And Review Change Log

Accepted steering, QA/UAT findings, PR review feedback, or implementation-discovered
bugs that change the contract must update the affected sections above in place. This
section records the audit trail; the current contract lives in the body of the
specification.

### 2026-11-26 13:10 EST — `accounts` uses the native MongoDB driver, not TypeORM

**Source.** Project Owner steering, during implementation. "Do not use TypeORM with MongoDB, use the native driver. Update specs and plans as required."

**Changed Sections.** [§1.b](#1b-feature--milestone-context), [§3 Scope](#3-scope), [§D-7](#d-7--fixed-identifiers-reset-recreates-empties-and-reloads), [§D-10](#d-10--the-three-unknowns-are-proven-before-anything-is-built-on-them), the new [§D-15](#d-15--accounts-uses-the-native-mongodb-driver), [AC1](#6-acceptance-criteria), AC4, AC16, [§7](#7-test-strategy), [§8 phase 0.2 and the store skeleton](#8-tdd-entry-point--prescriptive-execution-sequence), [§10 OQ-8](#10-open-questions). Outside the specification: the new ADR-011, the data architecture, the project plan, the implementation plan, the architecture's risks, the repository layout, the accounts specification.

**Rationale.** The plan made all three services use TypeORM and carried its MongoDB support as a risk, to be proven first by this step. The Project Owner removed the question before the proof ran. The plan's own fallback was the native driver, so choosing it now costs nothing and removes a possible rewrite of the service's data access in Step 2.

**Summary.** The second of the three unknowns is no longer TypeORM against MongoDB. It is the native `mongodb` driver against `mongodb-memory-server`, which has no fallback. `typeorm` and `@nestjs/typeorm` leave `apps/accounts` and stay in `trading` and `notifications`. Reset in `accounts` recreates collections and indexes instead of synchronizing a schema. A new decision record holds the reasoning, and the documents that said otherwise now point to it.

**Verification Impact.** AC1 gains "no ORM package in `apps/accounts`", checked by the manifest test. AC16(b) is reworded and verified by the same integration file as before. Nothing else changes. TypeORM is still proven by this step, in `trading` and `notifications`, where it stays.
