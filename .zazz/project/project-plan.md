# Project plan

**Project Owner:** @zazzcode
**Deliverable Owner for every step:** @zazzcode
**Written:** 2026-11-26 (Phase 0)
**Status:** reviewed by the Project Owner on 2026-11-26. The design and the services are approved. Revised the same day: services no longer call each other, and every service has a [specification](services/README.md)

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
| G4 | Deliberate weaknesses across the OWASP Top 10 and the OWASP API Security Top 10, with SQL injection, NoSQL injection, prototype pollution and stored XSS among them. Each has a stable ID and a protected counterpart, at about two safe operations for every vulnerable one |
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
| SC1 | After Step 5, a fresh clone installs and starts with one command on `127.0.0.1`, needing nothing but the two one-time database binary downloads, and stopping it leaves nothing behind | `docs/setup-and-testing.md` commands, run from a clean clone |
| SC2 | Every active scenario has an ID, a catalogue entry, documentation with a verified reproduction, a test proving the exploit, and — where meaningful — a counterpart asserted inert for the identical payload | `pnpm scenario:check` and the test suites in CI |
| SC3 | Ground truth is generated from one source: source hashes, scanner expectations and the dependency-audit snapshot. Drift fails CI | `pnpm scenario:check`, `pnpm audit:check` |
| SC4 | Every OWASP Top 10 (2021) category and every OWASP API Security Top 10 (2023) category has at least one scenario | The OWASP column of the [scenario catalogue](scenario-catalog.md) |
| SC5 | The planned size is 82 scenarios: 74 in application code on 62 vulnerable operations, and 8 vulnerable dependency pins. There are 118 safe operations. A step may move the number by about ten percent and records the change in the catalogue | The catalogue |
| SC9 | Every service is built and tested on its own, with no other service running | The test suite of each service |
| SC10 | No service calls another service | Review, and a lint rule that forbids a service from importing the HTTP client of another |
| SC6 | A scanner run can be scored without reading the repository: every `expectedFinding: true` row it misses is a false negative, and every `expectedFinding: false` row it flags for the listed CWE is a false positive | `tests/expected-scanner-findings.json` |
| SC7 | At least four libraries are present at a vulnerable version in one workspace and at a patched version in another, so a scanner has to say which service is affected | `docs/vulnerabilities/dependencies.md` and `tests/expected-audit.json` |
| SC8 | No scenario can be removed by a well-meaning refactor without a test failing | The test suites |

## 5. Constraints and assumptions

### Constraints given by the Project Owner

- The application is a **sample, not a running service**. It is started, preloaded with fake data, exercised, and shut down. The whole of it is ephemeral.
- Because the application is ephemeral, the databases are in memory. `mongodb-memory-server` and `mysql-memory-server` were named as options.
- NestJS with the Fastify adapter, built idiomatically; TypeScript; TypeORM. One backend service may use the Express adapter instead of Fastify.
- Microservices communicating through GraphQL federation and through HTTP/2.
- Services do not call each other. The gateway talks to every service, so that each can be built and tested on its own.
- Every OWASP Top 10 weakness, with SQL injection, NoSQL injection, prototype pollution and stored XSS included. About two safe operations for every vulnerable one, or one to one where two is harder.
- The functionality stays simple. The application is for vulnerability testing.
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
| A3 | The third backend service is `notifications` (price alerts and webhooks). It is the natural home for request forgery, template injection and command injection | It is dropped with its scenarios; the gateway and two services still meet the constraints |
| A4 | The NestJS 12 line stays current for the life of this lab | Versions are re-pinned per phase; exact pins are kept |
| A5 | Deliberate flaws are added *after* the functional baseline of their service, as twin operations in separate files | The functional work would have to carry the flaws; more rework per review |

## 6. The solution in one page

Four NestJS 12 processes in one pnpm workspace, each with its own `package.json` so that a dependency finding can be attributed to a service:

| Service | Adapter | Owns | Store | Listener |
| --- | --- | --- | --- | --- |
| `gateway` | Fastify | The federated GraphQL schema, REST pass-through, the only public listener | none | `127.0.0.1:3000`, HTTP/1.1 |
| `accounts` | Fastify | Users, sign-in, sessions, profile, documents | MongoDB, ephemeral | `127.0.0.1:3101`, HTTP/2 |
| `trading` | Fastify | Markets, prices, wallets, deposits, orders, trades, reports | MySQL, ephemeral | `127.0.0.1:3102`, HTTP/2 |
| `notifications` | Express | Price alerts, webhook deliveries, announcements | SQLite in memory | `127.0.0.1:3103`, HTTP/1.1 |

- **It is a sample that is started, preloaded with fake data, exercised, and stopped.** The stores are in memory or temporary because nothing in the application survives. Every start loads the same fake data. A reset or a restart undoes anything an exploit did.
- **Graph:** each backend service is an Apollo Federation 2 subgraph, written code first. The gateway composes them into one schema at `/graphql`.
- **Calls only from the gateway.** Services never call each other, so each is built and tested alone. To the Fastify services the gateway speaks HTTP/2 without TLS, on loopback. To the Express service, HTTP/1.1.
- **Edge:** HTTP/1.1, so curl, Postman, Newman and Burp work without a TLS setup.
- **Flaws:** a service's safe operations are written first, then its vulnerable twin operations, each with protected counterparts. About two safe operations for every vulnerable one. Step 4 pins vulnerable library versions.

The full design, and what follows from the application being ephemeral, is in [../architecture/project.md](../architecture/project.md).

## 7. Build order

The build order is in [implementation-plan.md](implementation-plan.md): what each step delivers, who does it, and what "done" means for it. The service built in each step is defined by its [service specification](services/README.md).

| Step | Who | Branch | Delivers |
| --- | --- | --- | --- |
| 0 | — | `phase-0-plan-and-architecture` | The plan, the architecture, the service specifications. This change |
| 1 Scaffolding | The lead agent | `phase-1-foundation` | The repository skeleton: every service starts, the graph is composed, every store is wired, tests and CI run |
| 2 Services | One sub-agent per service, in parallel | `phase-2a-accounts`, `phase-2b-trading`, `phase-2c-notifications`, `phase-2d-gateway` | Each service complete against its specification, with its tests |
| 3 Integration | The lead agent | `phase-3-integration` | End-to-end tests through the gateway, the Postman collection, the ground-truth checks green |
| 4 Dependency pins | One agent | `phase-4-dependencies` | The eight pins, the audit snapshot, the reachability statements |
| 5 Release | The lead agent | `phase-5-release` | A full verification from a clean clone, the finished documentation, the tag `v1.0.0` |

The four branches of step 2 can be built at the same time because services never call each other. Each is built, and tested, on its own.

### Milestones

| Milestone | Steps | Outcome |
| --- | --- | --- |
| M1 — Running skeleton | 1 | Four processes, one composed graph, HTTP/2 between the Fastify processes, fake data loaded, a clean stop, CI |
| M2 — The services | 2 | All four services complete against their specifications |
| M3 — Measurable | 3 | Every scenario reachable through the gateway, with ground truth that CI checks |
| M4 — Complete vulnerability lab | 4 | The dependency pins, with the audit snapshot |
| M5 — Released | 5 | Verified, documented, tagged |

## 8. Branch and PR workflow

1. **Branch.** `git checkout -b phase-<n>-<slug>` from the step's base branch.
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
| R1 | TypeORM's documentation calls its MongoDB support basic. The `accounts` service may hit a gap in TypeORM 1.1.3 | Medium | Validate in the scaffolding, with one real entity. Fallback: the native `mongodb` driver behind the same repositories |
| R2 | The Apollo gateway on the Fastify adapter with an HTTP/2 data source | Closed | **Verified** by a spike on 2026-11-26: the gateway composed a Fastify subgraph and an Express subgraph, and the Fastify one received every request over `HTTP/2.0`. The spike did not cover the code-first schema generator with TypeScript 6, or TypeORM against MongoDB. The scaffolding checks both first |
| R3 | `mysql-memory-server` downloads a large binary from MySQL's CDN. A slow or failed download breaks CI | Medium | Pin the MySQL version, cache the binary in CI, and give the trading tests a generous start timeout |
| R4 | A vulnerable pin may not install under pnpm 12, or may break the service that uses it | Medium | Pins are chosen without install scripts. Each is validated in Step 4; the dependency document lists replacements |
| R5 | New advisories appear for pinned libraries and change the audit snapshot | High, over time | `pnpm audit:update` adds advisories freely. Only removal needs a named retirement |
| R6 | TypeScript 6 may not work with the code-first GraphQL generator (`ts-morph`) | Low | The NestJS scaffold uses TypeScript 6; the official federation sample uses 5.9.3. Fall back to 5.9.3 |
| R7 | NestJS 12 is new (12.6.3 was published on 2026-11-26). Releases may change behaviour between steps | Medium | Exact pins per step. Versions are re-checked at the start of each step, and upgrades are deliberate |
| R8 | The catalogue is large. One review may be too big to absorb | Medium | One sub-agent per service keeps each review to one service. A service that is still too large is split: its safe operations in one pull request, its vulnerable ones in the next |
| R12 | Four sub-agents work at the same time and could edit the same file | Medium | Each writes only inside its own service directory. Everything shared belongs to the lead agent. A sub-agent that needs a shared change stops and asks |
| R9 | Several scenarios can execute code on the host that runs the lab (deserialization, `eval`, command injection) | Certain, by design | Loopback only, fake data, no real secrets on the machine that runs it, a warning in README and SECURITY.md |
| R10 | GitHub flags the vulnerable pins through Dependabot security alerts and automated pull requests | High | The Project Owner turns off Dependabot security updates for this repository, as in vuln-nextjs |
| R11 | Killing the lab instead of stopping it can leave a temporary data directory behind | Low | The launcher stops the database engines on every exit it can intercept, and the documentation says to stop the lab as a whole |

## 10. Open questions

Each has a default the plan follows. Change any of them in review.

| ID | Question | Default in this plan |
| --- | --- | --- |
| Q1 | Is `zazz-skills` the methodology you meant? The link was missing from the request | Yes; `.zazz/` follows its document model with the two adaptations named in [../README.md](../README.md) |
| Q2 | Is the third backend service wanted, or should the lab stay at two? | `notifications`, because it gives request forgery, template injection and command injection a real home |
| Q3 | Should the specification be reviewed on its own before implementation, in a separate pull request? | One pull request per deliverable: the specification is its first commit, and the PR opens as a draft until it is approved |
| Q4 | Which authentication and validation patterns should the baseline use? | The established ones: `@nestjs/jwt` with custom guards, and class-validator DTOs. NestJS 12 also teaches `@nestjs/authentication` and Zod schemas; they are an optional later variant. See [../architecture/decisions/ADR-007-auth-and-validation-patterns.md](../architecture/decisions/ADR-007-auth-and-validation-patterns.md) |
| Q5 | Should vulnerable operations carry a sink marker comment (`// SQL-001 / CWE-89: …`), as most of vuln-nextjs does? | Yes, with neutral identifiers and file names, as in vuln-nextjs. A marker reveals the answer to a scanner that reads comments. The release step can add a holdout batch without markers |
| Q6 | May the plan use default ports 3000 (gateway) and 3101 to 3103 (services)? vuln-nextjs uses 3000 and 3001 | Yes; every port is an environment variable |
| Q7 | Should NestJS Observe, which the NestJS 12 scaffold wires in, stay out? | Out. The lab sends no telemetry |
| Q8 | Is a holdout batch wanted at release? | Left open until Step 4 |
| Q9 | Which backend service uses the Express adapter? The Project Owner approved the design without naming one | `notifications`, the default. It keeps the gateway and the money path between `trading` and `accounts` on Fastify with HTTP/2 between them. The alternative is `accounts`, which would move the upload, cookie and form handling to Express idioms |
