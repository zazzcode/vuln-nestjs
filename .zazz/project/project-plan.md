# Project plan

**Project Owner:** @zazzcode
**Deliverable Owner for every phase:** @zazzcode
**Written:** 2026-11-26 (Phase 0)
**Status:** proposed, waiting for review

## 1. Objective

Build a deliberately vulnerable NestJS application that a vulnerability scanner can be measured against. It must behave like real software — a fake cryptocurrency exchange with several services — so that the weaknesses sit where scanners meet them in practice, and every weakness must be labelled so a scanner's report can be scored.

## 2. Background

We are building a tool that scans web applications and microservices for security weaknesses. To test it we need sample applications that demonstrate the OWASP weaknesses, with two properties that public samples rarely have together:

- **The weaknesses are deliberate and known.** A finding can be compared with an expected finding, so a miss is a false negative and a report against clean code is a false positive.
- **The application uses the stack we care about.** NestJS with the Fastify adapter, GraphQL federation, HTTP/2 between services, TypeORM, MongoDB and MySQL.

The existing [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs) lab covers Next.js. This repository covers the NestJS microservice shape.

## 3. Goals and non-goals

### Goals

| ID | Goal |
| --- | --- |
| G1 | A functional API: an administrator creates accounts and credits dollars; five users buy and sell five coins |
| G2 | An idiomatic NestJS 12 system: one gateway plus three backend services, TypeScript, TypeORM, with the Fastify adapter on three processes and the Express adapter on one |
| G3 | GraphQL federation between the services, and HTTP/2 for the calls between them |
| G4 | Deliberate weaknesses across the OWASP Top 10 and the OWASP API Security Top 10, each with a stable ID and a protected counterpart where meaningful |
| G5 | Vulnerable versions of libraries that the dependency scanner must report, pinned in one service at a time |
| G6 | Automated tests with Vitest and a Postman collection that runs under Newman, proving each weakness is exploitable and each counterpart is inert |
| G7 | Documentation of every vulnerable route and aspect, for people and for agents |

### Non-goals

- Staying up. The application is a sample that is started, preloaded with fake data, exercised, and shut down. No deployment, persistence or scaling.
- A user interface (may come later).
- A production-grade exchange: real prices, real money, partial fills, streaming prices.
- Following the Zazz methodology exactly.

## 4. Success criteria

| ID | Criterion | Verified by |
| --- | --- | --- |
| SC1 | After Phase 10, a fresh clone installs and starts with one command on `127.0.0.1`, needing nothing but the two one-time database binary downloads, and stopping it leaves nothing behind | `docs/setup-and-testing.md` commands, run from a clean clone |
| SC2 | Every active scenario has an ID, a catalogue entry, documentation with a verified reproduction, a test proving the exploit, and — where meaningful — a counterpart asserted inert for the identical payload | `pnpm scenario:check` and the test suites in CI |
| SC3 | Ground truth is generated from one source: source hashes, scanner expectations and the dependency-audit snapshot. Drift fails CI | `pnpm scenario:check`, `pnpm audit:check` |
| SC4 | Every OWASP Top 10 (2021) category and every OWASP API Security Top 10 (2023) category has at least one scenario | The OWASP column of the [scenario catalogue](scenario-catalog.md) |
| SC5 | The planned size is 72 active scenarios, 8 of them vulnerable dependency pins, and 5 negative controls. A phase specification may move the number by about ten percent and records the change in the catalogue | The catalogue |
| SC6 | A scanner run can be scored without reading the repository: every `expectedFinding: true` row it misses is a false negative, and every `expectedFinding: false` row it flags for the listed CWE is a false positive | `tests/expected-scanner-findings.json` |
| SC7 | At least four libraries are present at a vulnerable version in one workspace and at a patched version in another, so a scanner has to say which service is affected | `docs/vulnerabilities/dependencies.md` and `tests/expected-audit.json` |
| SC8 | No scenario can be removed by a well-meaning refactor without a test failing | The test suites |

## 5. Constraints and assumptions

### Constraints given by the Project Owner

- The application is a **sample, not a running service**. It is started, preloaded with fake data, exercised, and shut down. The whole of it is ephemeral.
- Because the application is ephemeral, the databases are in memory. `mongodb-memory-server` and `mysql-memory-server` were named as options.
- NestJS with the Fastify adapter, built idiomatically; TypeScript; TypeORM. One backend service may use the Express adapter instead of Fastify.
- Microservices communicating through GraphQL federation and through HTTP/2.
- One gateway, which serves the graph, and no more than three backend services. The backend services are reached only through the gateway.
- One service stores its data in MongoDB in memory; a different one uses MySQL in memory.
- Vitest for tests; automated API tests through Postman and Newman, or another recommended tool.
- Older versions of some libraries with published vulnerabilities, kept to audit the application.
- A `docs/` directory describing the vulnerable routes and aspects. The README states the objective and links to the NestJS documentation and GitHub.
- One feature branch per phase, and a pull request for review.

### Assumptions made in this plan

| ID | Assumption | If wrong |
| --- | --- | --- |
| A1 | The methodology referred to is the [Zazz methodology](https://github.com/zazzcode/zazz-skills); the link was missing from the request | The layout of `.zazz/` is adjusted |
| A2 | pnpm and Node 24 are used, as in vuln-nextjs | Minor: the workspace and script names change |
| A3 | The third backend service is `notifications` (price alerts and webhooks). It is the natural home for request forgery, template injection and command injection | Phase 4 and part of Phase 8 are dropped; the gateway and two services still meet the constraints |
| A4 | The NestJS 12 line stays current for the life of this lab | Versions are re-pinned per phase; exact pins are kept |
| A5 | Deliberate flaws are added *after* the functional baseline, as twin operations in separate files | The functional phases would have to carry the flaws; more rework per review |

## 6. The solution in one page

Four NestJS 12 processes in one pnpm workspace, each with its own `package.json` so that a dependency finding can be attributed to a service:

| Service | Adapter | Owns | Store | Listener |
| --- | --- | --- | --- | --- |
| `gateway` | Fastify | The federated GraphQL schema, REST pass-through, the only public listener | none | `127.0.0.1:3000`, HTTP/1.1 |
| `accounts` | Fastify | Users, sessions, wallets, deposits, withdrawals, the ledger | MongoDB, ephemeral | `127.0.0.1:3101`, HTTP/2 |
| `trading` | Fastify | Markets, orders, the order book, trades, price ticks | MySQL, ephemeral | `127.0.0.1:3102`, HTTP/2 |
| `notifications` | Express | Price alerts, webhook deliveries, announcements | SQLite in memory | `127.0.0.1:3103`, HTTP/1.1 |

- **It is a sample that is started, preloaded with fake data, exercised, and stopped.** The stores are in memory or temporary because nothing in the application survives. Every start loads the same fake data. A reset or a restart undoes anything an exploit did.
- **Graph:** each backend service is an Apollo Federation 2 subgraph, written code first. The gateway composes them into one schema at `/graphql`.
- **Calls between services:** HTTP/2 without TLS, on loopback, wherever both ends are Fastify. `trading` calls `accounts` to hold and settle funds over HTTP/2. The Express service speaks HTTP/1.1, so the calls to it do too.
- **Edge:** HTTP/1.1, so curl, Postman, Newman and Burp work without a TLS setup.
- **Flaws:** Phases 2 to 4 ship each service working and safe. Phases 6 to 8 add vulnerable twin operations next to the safe ones. Phase 9 pins vulnerable library versions.

The full design, and what follows from the application being ephemeral, is in [../architecture/project.md](../architecture/project.md).

## 7. Phases and deliverables

Phases are ordered by dependency. No dates are set; the Project Owner decides when each starts. Each phase is one specification, one branch and one pull request, except Phase 0.

### Milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| M1 — Running skeleton | 1 | Four processes, one composed graph, HTTP/2 between the Fastify services, fake data loaded, clean stop, CI |
| M2 — Functional exchange | 2, 3, 4 | Accounts, trading and notifications work end to end and are written safely |
| M3 — Measurable | 5 | Catalogue, ground truth and documentation contract proven on a pilot batch |
| M4 — Complete vulnerability lab | 6, 7, 8, 9 | Every planned scenario and dependency pin, with tests and documentation |
| M5 — Released | 10 | Verified, documented, tagged |

### Phase 0 — Plan, architecture and documentation skeleton

**Branch:** `phase-0-plan-and-architecture` (this change)

**Deliverables:** the project orientation and this plan; requirements; the planned scenario catalogue; the architecture documents and decision records; the specification index and template; README, AGENTS.md, SECURITY.md; the reader-facing documentation skeleton.

**Exit criteria:** the Project Owner approves the plan, or asks for changes.

### Phase 1 — Foundation: walking skeleton

**Branch:** `phase-1-foundation` · **Specification:** `001-foundation.md`

**Goal:** prove the technical shape with the least code. Four processes start, compose one graph, and load fake data into in-memory stores.

**Deliverables**

- pnpm workspace with root tooling: TypeScript 6, oxlint, Prettier, Vitest, exact version pins, Node and pnpm engines.
- Shared libraries under `libs/`: `config` (including the service registry), `http2`, `internal-auth`, `testing`.
- `apps/gateway`: Fastify on HTTP/1.1; Apollo gateway composing the three subgraphs at start; `/graphql`, `/api/v1/health`, `/api/v1/lab/reset`, `/docs`.
- The three backend services: `accounts` and `trading` on the Fastify adapter with `http2: true`; `notifications` on the Express adapter over HTTP/1.1. Each has an Apollo subgraph with one placeholder type, a TypeORM connection to MongoDB, MySQL and SQLite in memory, and health and reset on `/internal`.
- A launcher that starts the services in dependency order, and that stops them and their database processes on exit.
- A CI workflow: lint, unit tests, build, end-to-end tests, and a non-blocking audit report.
- A Postman collection and environment, run by Newman in CI: health and one query that crosses all three subgraphs.
- `docs/setup-and-testing.md`, with every command run before it was written.

**Exit criteria**

- One command starts the stack on loopback, and the gateway answers a query whose fields come from all three subgraphs.
- A test proves the gateway reached `accounts` and `trading` over HTTP/2 and `notifications` over HTTP/1.1.
- Reset returns every store to its fake data.
- After the stop command, no database process and no temporary data directory remain.
- CI is green on the pull request.

**Out of scope:** domain logic, deliberate flaws, vulnerable pins.

### Phase 2 — Accounts, functional

**Branch:** `phase-2-accounts-functional` · **Specification:** `002-accounts-functional.md`

**Goal:** identity and money, written safely. These operations become the protected counterparts of Phase 6.

**Deliverables**

- MongoDB entities: `User`, `Session`, `Wallet`, `LedgerEntry`.
- GraphQL: `me`, `user`, `users`, `wallet`, `ledger`; `signIn`, `signOut`, `createUser`, `deposit`, `withdraw`, `updateProfile`.
- REST through the gateway, in Fastify idioms: cookie sign-in and sign-out (`@fastify/cookie`); statement download; avatar fetch from a URL; document upload (`@fastify/multipart`).
- Internal REST over HTTP/2: wallet hold, release and settle for `trading`; wallet lookup; reset; health.
- Authentication and authorization: JWT access tokens, refresh tokens stored in MongoDB and deleted on sign-out, scrypt password hashing, a global authentication guard, role and ownership checks, DTO validation with an allowlist.
- Seed data: the administrator and five users.

**Exit criteria**

- The administrator creates a user and credits dollars. The user signs in, reads the wallet and withdraws.
- Every operation rejects a caller without the right role, or without ownership of the object.
- Unit, integration and end-to-end tests pass in CI, and the Postman folder for accounts passes under Newman.

**Out of scope:** trading, alerts, deliberate flaws.

### Phase 3 — Trading, functional

**Branch:** `phase-3-trading-functional` · **Specification:** `003-trading-functional.md`

**Goal:** a small exchange that works, written safely. These operations become the protected counterparts of Phase 7.

**Deliverables**

- MySQL entities: `Market`, `Order`, `Trade`, `PriceTick`.
- Matching: market orders fill at the reference price; limit orders rest in the book and match by price then time; no partial fills.
- Calls to other services: wallet hold and settle on `accounts` over HTTP/2; alert evaluation on `notifications` over HTTP/1.1, after each price tick.
- GraphQL: `markets`, `market`, `orderBook`, `trades`, `orders`, `order`; `User.orders` and `Order.user` across services; `placeOrder`, `cancelOrder`, `tickPrices`.
- REST through the gateway: trade export as CSV with spreadsheet formulas neutralized; report file download; reset.
- Seed data: five markets with reference prices, and some orders and trades.

**Exit criteria**

- A user buys and sells each coin at the reference price.
- A limit order rests, then fills on a later tick. Cancelling works only for the owner.
- The book and the history are correct after reset and a scripted sequence of orders.
- Tests and the Postman folder for trading pass in CI.

**Out of scope:** alerts, deliberate flaws.

### Phase 4 — Notifications, functional

**Branch:** `phase-4-notifications-functional` · **Specification:** `004-notifications-functional.md`

**Goal:** price alerts that are delivered to a webhook, written safely. These operations become the protected counterparts of the notifications part of Phase 8.

**Deliverables**

- SQLite entities in memory: `Alert`, `Delivery`, `Announcement`.
- GraphQL: `alerts`, `deliveries`, `announcements`; `User.alerts`; `createAlert`, `deleteAlert`, `setWebhookUrl`, `testWebhook`, `broadcastAnnouncement`.
- The Express adapter in use: JSON body parsing, a NestJS middleware class, and views rendered with `ejs`.
- An alert evaluation endpoint on `/internal`, called by `trading` after a price tick.
- Webhook delivery: an in-process queue, signed payloads, a delivery log.
- Message rendering from fixed templates, with user data passed as data.
- REST through the gateway: webhook test; announcement send.

**Exit criteria**

- An alert fires when a tick crosses its threshold, and the webhook reaches a loopback receiver with a signature the test can verify.
- The delivery log records every attempt.
- A webhook URL outside the allowlist is refused.
- Tests and the Postman folder for notifications pass in CI.

**Out of scope:** deliberate flaws.

### Phase 5 — Scenario framework and pilot batch

**Branch:** `phase-5-scenario-framework` · **Specification:** `005-scenario-framework.md`

**Goal:** make one scenario a repeatable deliverable before the batches arrive.

**Deliverables**

- `catalog/catalog.json`: the schema and a validator.
- Ground truth scripts: `pnpm scenario:check` and `scenario:update` (source hashes and scanner expectations), `pnpm audit:check` and `audit:update` (the audit snapshot; the update refuses to drop an advisory unless it is retired by name).
- The documentation contract: `docs/adding-scenarios.md` and the per-scenario module template.
- Test patterns: exploit and counterpart pairs in Vitest; a Postman folder layout for exploits; the harmless-marker convention.
- The pilot batch: ACCESS-001, ACCESS-003, LOGIC-001 and MONGO-001, each with documentation, tests in both directions, a catalogue entry and snapshots.
- The command matrix in AGENTS.md, and the two checks as CI gates.

**Exit criteria**

- Each pilot scenario is exploitable and its counterpart inert under the identical payload, in CI.
- Changing a registered source file without re-snapshotting fails `pnpm scenario:check`.
- An audit that returns one advisory fewer fails `pnpm audit:update` unless that advisory is retired by name.

### Phase 6 — Accounts vulnerability batch

**Branch:** `phase-6-accounts-vulnerabilities` · **Specification:** `006-accounts-vulnerabilities.md`

**Scenarios:** AUTH-001 to 005, ACCESS-004 and 005, MONGO-002 to 006, CRYPTO-001 to 003, DESER-001, COOKIE-001 and 002, LOGIC-002, INFO-001, RE-001, RES-001, and the negative control DEMO-004. Twenty-two active scenarios; with the four from the pilot batch, accounts carries twenty-six.

**Exit criteria:** every scenario is documented, tested in both directions, and in the snapshots. CI is green.

### Phase 7 — Trading vulnerability batch

**Branch:** `phase-7-trading-vulnerabilities` · **Specification:** `007-trading-vulnerabilities.md`

**Scenarios:** SQL-001 to 004, ACCESS-002, LOGIC-003 to 005, INJECT-004, FS-001, RES-002, and the negative controls DEMO-001 and DEMO-003. Eleven active scenarios and two negative controls.

**Exit criteria:** as Phase 6.

### Phase 8 — Notifications and gateway vulnerability batch

**Branch:** `phase-8-notifications-gateway-vulnerabilities` · **Specification:** `008-notifications-gateway-vulnerabilities.md`

**Scenarios:** OS-001 and 002, DESER-002 and 003, FS-002 and 003, SSRF-001 to 003, REDIR-001, INJECT-001 to 003, COOKIE-003, GQL-001 to 007, CONFIG-001 to 004, ACCESS-006, INFO-002, and the negative controls DEMO-002 and DEMO-005. Twenty-seven active scenarios and two negative controls.

**A note on the configuration scenarios.** Some of them are true from Phase 1, because a local sample that lives for minutes has no reason to switch introspection, GraphiQL or the OpenAPI document off. Phase 8 does not add those. It registers them, marks them in the options files, documents them, and adds the rest (permissive CORS, missing security headers, stack traces in error responses, the debug endpoint).

**Exit criteria:** as Phase 6.

### Phase 9 — Vulnerable dependencies

**Branch:** `phase-9-vulnerable-dependencies` · **Specification:** `009-vulnerable-dependencies.md`

**Deliverables**

- Eight pins, each in one workspace: SCA-001 to SCA-008, listed in [docs/vulnerabilities/dependencies.md](../../docs/vulnerabilities/dependencies.md).
- The audit snapshot `tests/expected-audit.json`, covering production dependencies of every workspace.
- For each pin, a statement of whether a runtime path reaches the vulnerable function, and a runtime test where one does.
- The control workspaces: the same library at a patched version, where the lab has a real use for it.

**Exit criteria:** `pnpm audit:check` passes; a scanner can attribute every finding to a workspace from `tests/expected-audit.json`; CI is green.

**Fallback:** if a pin does not install or breaks a service, it is replaced by another candidate from the dependency document, in the same phase.

### Phase 10 — Verification and release

**Branch:** `phase-10-verification-release` · **Specification:** `010-verification-release.md`

**Deliverables**

- A full verification from a clean clone against every success criterion in section 4, with the evidence in the pull request.
- The complete reader-facing documentation: README, `docs/`, and every scenario module.
- A holdout batch, if the Project Owner wants one: ten to fifteen scenarios with neutral names and no sink markers, whose labels stay out of the repository until the holdout ends.
- The tag `v1.0.0`.

**Exit criteria:** every success criterion is met, or the gap is recorded in the pull request and accepted by the Project Owner.

## 8. Branch and PR workflow

1. **Branch.** `git checkout -b phase-<n>-<slug>` from `main`.
2. **Specification first.** The agent writes `.zazz/specifications/<nnn>-<slug>.md` from the template, as the first commit on the branch, and opens the pull request as a draft with only that commit.
3. **Greenlight.** The Project Owner approves the specification in the pull request, or asks for changes. No implementation starts before that.
4. **Implementation.** Further commits on the same branch. The specification is updated in place when implementation changes the contract, and the change is recorded in its change log.
5. **Ready for review.** When the definition of done in the specification is met and the evidence is in the pull request, the agent marks it ready. The Project Owner reviews and merges.
6. **Durable documents.** The same pull request updates whatever the change made untrue: this plan, the architecture documents, the catalogue, `docs/`.

Rules:

- Commit and push to the feature branch only. Never commit to `main` directly.
- Commit messages follow Conventional Commits, with the service as scope where it applies (`feat(accounts): …`), and the body explains why.
- Every pull request uses `.github/pull_request_template.md`: context, why, functional overview, reviewer notes, verification, risks.
- Generated files (`tests/expected-*.json`) are never edited by hand, and are re-snapshotted in the same commit as the change that justifies them.

## 9. Risks and mitigations

| ID | Risk | Likelihood | Mitigation |
| --- | --- | --- | --- |
| R1 | TypeORM's documentation calls its MongoDB support basic. The `accounts` service may hit a gap in TypeORM 1.1.3 | Medium | Validate in Phase 1 with one real entity. Fallback: the native `mongodb` driver behind the same repositories |
| R2 | The Apollo gateway on the Fastify adapter with an HTTP/2 fetcher is supported by the packages' typings and the documentation, but has not been run here | Medium | Phase 1 proves it end to end and is the first thing built. Fallback: HTTP/1.1 for schema discovery and HTTP/2 for data sources, then the Mercurius gateway |
| R3 | `mysql-memory-server` downloads a large binary from MySQL's CDN. A slow or failed download breaks CI | Medium | Pin the MySQL version, cache the binary in CI, and give the trading tests a generous start timeout |
| R4 | A vulnerable pin may not install under pnpm 12, or may break the service that uses it | Medium | Pins are chosen without install scripts. Each is validated in Phase 9; the dependency document lists replacements |
| R5 | New advisories appear for pinned libraries and change the audit snapshot | High, over time | `pnpm audit:update` adds advisories freely. Only removal needs a named retirement |
| R6 | TypeScript 6 may not work with the code-first GraphQL generator (`ts-morph`) | Low | The NestJS scaffold uses TypeScript 6; the official federation sample uses 5.9.3. Fall back to 5.9.3 |
| R7 | NestJS 12 is new (12.6.3 was published on 2026-11-26). Releases may change behaviour between phases | Medium | Exact pins per phase. Versions are re-checked at the start of each phase, and upgrades are deliberate |
| R8 | The catalogue is large. A phase may turn out bigger than one review can absorb | Medium | Phases 6 to 9 may be split into two pull requests each by service or family. The stretch scenarios are cut first |
| R9 | Several scenarios can execute code on the host that runs the lab (deserialization, `eval`, command injection) | Certain, by design | Loopback only, fake data, no real secrets on the machine that runs it, a warning in README and SECURITY.md |
| R10 | GitHub flags the vulnerable pins through Dependabot security alerts and automated pull requests | High | The Project Owner turns off Dependabot security updates for this repository, as in vuln-nextjs |
| R11 | Killing the lab instead of stopping it can leave a temporary data directory behind | Low | The launcher stops the database engines on every exit it can intercept, and the documentation says to stop the lab as a whole |

## 10. Open questions

Each has a default the plan follows. Change any of them in review.

| ID | Question | Default in this plan |
| --- | --- | --- |
| Q1 | Is `zazz-skills` the methodology you meant? The link was missing from the request | Yes; `.zazz/` follows its document model with the two adaptations named in [../README.md](../README.md) |
| Q2 | Is the third backend service wanted, or should the lab stay at two? | `notifications`, because it gives request forgery, template injection and command injection a real home |
| Q3 | Should the specification be reviewed on its own before implementation, in a separate pull request? | One pull request per phase: the specification is its first commit, and the PR opens as a draft until it is approved |
| Q4 | Which authentication and validation patterns should the baseline use? | The established ones: `@nestjs/jwt` with custom guards, and class-validator DTOs. NestJS 12 also teaches `@nestjs/authentication` and Zod schemas; they are an optional later variant. See [../architecture/decisions/ADR-007-auth-and-validation-patterns.md](../architecture/decisions/ADR-007-auth-and-validation-patterns.md) |
| Q5 | Should vulnerable operations carry a sink marker comment (`// SQL-001 / CWE-89: …`), as most of vuln-nextjs does? | Yes, with neutral identifiers and file names, as in vuln-nextjs. A marker reveals the answer to a scanner that reads comments. Phase 10 can add a holdout batch without markers |
| Q6 | May the plan use default ports 3000 (gateway) and 3101 to 3103 (services)? vuln-nextjs uses 3000 and 3001 | Yes; every port is an environment variable |
| Q7 | Should NestJS Observe, which the NestJS 12 scaffold wires in, stay out? | Out. The lab sends no telemetry |
| Q8 | Is a holdout batch wanted in Phase 10? | Left open until Phase 9 |
| Q9 | Which backend service uses the Express adapter? | `notifications`. It keeps the gateway and the money path between `trading` and `accounts` on Fastify with HTTP/2 between them. The alternative is `accounts`, which would move the upload, cookie and form handling to Express idioms |
