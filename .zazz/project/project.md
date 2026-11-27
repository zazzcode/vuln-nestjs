# VCX — project orientation

## Purpose

This repository is a deliberately vulnerable application for testing tools that find security weaknesses in source code and in running web applications (SAST, SCA and DAST). It exists because a scanner is only as good as the evidence behind it: every weakness in this application has a stable ID, a documented expected finding, an automated test proving it is exploitable, and a protected counterpart that handles the identical payload safely.

The application is **VCX (Vulnerable Crypto Exchange)**, a small fake cryptocurrency exchange. VCX is its name whatever it is written in; this repository is its NestJS implementation. It is functional enough to behave like real software (accounts, wallets, an order book, price alerts), because weaknesses that sit in plausible features are the ones scanners meet in practice. It is built the way a current NestJS system is built, so the framework idioms are real and not improvised.

## Operating model: started, preloaded, exercised, stopped

This is a **sample application, not a running service**. It is not deployed, it has no users, and nothing in it is meant to survive.

| Step | What happens |
| --- | --- |
| Start | One command starts the three backend services. Each starts its own database, loads fake data, and listens on loopback. Then the gateway starts |
| Exercise | An automated test, a scanner, or a person with curl or Postman calls the gateway. At any time, `POST /api/v1/lab/reset` loads the fake data again |
| Stop | All four processes stop, the databases stop, and their data is gone. The machine is as it was |

What that implies:

- **The whole application is ephemeral, so the databases are in memory or temporary.** There is nothing to persist and no reason to persist it.
- **The data is fake from the start.** Five users, an administrator, five coins, and some orders are loaded at every start. Nobody enters real data.
- **Anything may be broken.** The exploits are destructive by nature. A dropped table or an overdrawn wallet is undone by a reset.
- **Every run is the same.** A scanner, a test, and a person see the same data and the same behaviour.
- **Services never call each other.** The gateway talks to every service. Each service is built, and tested, on its own.

## Who it is for

| Audience | What they get |
| --- | --- |
| Scanner authors | A target with stable ground truth: a catalogue of expected findings, source hashes, and a dependency-audit snapshot. Per-workspace dependency pins test whether a scanner can say *which* service has the vulnerable package. Both of NestJS's HTTP adapters are present |
| Security learners | Per-scenario documentation with the flaw explained, reproduction steps, and the protected counterparts |
| Coding agents | [AGENTS.md](../../AGENTS.md): the invariants, the workflow, and what each may write |

## The product being imitated

### Actors

| Actor | Seeded | Can do |
| --- | --- | --- |
| Administrator | 1 | Create user accounts, credit US dollars to a user, read every user, wallet and order, set reference prices, broadcast announcements |
| User | 5 (alice, bob, carol, dave, erin) | Sign in and out, read balances, buy and sell the five coins with dollars, place and cancel limit orders, read the order book and trade history, withdraw dollars, create price alerts, receive webhook notifications |

### Markets

Five coins against the US dollar: BTC, ETH, SOL, XRP and DOGE. Prices move through a simulated price tick, not through trading.

### Money

All money is synthetic and starts from the fake data. Amounts are integer minor units (cents for dollars, hundred-millionths for coins) and cross the API as strings through a `Decimal` scalar. The administrator can credit any user with more dollars at any time.

## Capabilities

| Capability | Where it lives | Built in |
| --- | --- | --- |
| Federated GraphQL API behind a single gateway | `gateway` (Fastify) | Step 1 |
| Sign-in, sessions, profile, documents | `accounts` (Fastify, MongoDB) | Step 2 |
| Markets, prices, wallets, deposits, withdrawals, ledger, orders, trades, reports | `trading` (Fastify, MySQL) | Step 2 |
| Price alerts, webhook delivery, announcements | `notifications` (Express, SQLite) | Step 2 |
| Deliberate weaknesses, designed with their service, each with protected counterparts | every service | Step 2 |
| Documentation and ground truth for every scenario | `docs/`, `catalog/`, `tests/` | Steps 1 to 5 |

See [requirements.md](requirements.md) for the full list.

## Operating assumptions and constraints

- **It runs on one machine, for as long as a test or a scan takes.** Every listener binds `127.0.0.1`.
- **It needs the network once.** `mongod` and `mysqld` binaries are downloaded on first use and cached afterwards. Nothing else leaves the machine, except requests that a deliberately vulnerable endpoint is told to make.
- **The only way in is the gateway.** The backend services are reachable on loopback ports because they have to be, and nothing else is exposed.
- **The flaws are the product.** A flaw that stops being exploitable is a regression, not a fix. See [AGENTS.md](../../AGENTS.md).
- **Versions are pinned exactly.** A dependency change moves the audit snapshot.
- **Current NestJS, both adapters.** The lab tracks NestJS 12, which is ESM-only and tests with Vitest. Three processes use the Fastify adapter and one uses the Express adapter. The vulnerable versions are deliberate pins of individual libraries, not an old framework.

## Boundaries — what this lab does not do

- No real money, real prices, real identities, or real credentials.
- No user interface. A UI may be added later; until then the API is the product.
- No persistence, no deployment, and no expectation of staying up. A restart returns every store to its fake data.
- No calls between services. A flow that needs two services is two calls made by the client.
- No production-grade exchange engine: no matching between orders, no partial fills, no streaming prices, no withdrawals to external addresses. The Apollo gateway does not forward subscriptions, so the graph offers queries and mutations only.
- No operational plumbing: retries, reconciliation, metrics, tracing. NestJS Observe, which the NestJS 12 scaffold wires in, is left out on purpose.
- It is not a template for building a secure exchange. The safe operations are written safely so that protected counterparts exist, but the vulnerable operations are unsafe by design.

## Principles for future work

1. **Safe operations first.** A service's safe operations are written and tested before any vulnerable one. Each vulnerable operation is a twin in a separate file, so that the same payload can be sent to both.
2. **Every vulnerable operation has a protected counterpart**, and the lab keeps about two safe operations for every vulnerable one.
3. **Ground truth is generated, never hand-edited.** The scenario catalogue is the single source of truth; hashes, scanner expectations and the audit snapshot are derived from it.
4. **A protected counterpart is a scoped claim.** It says "this pattern defeats this flaw for identical input", never "secure in general".
5. **Safety rails stay.** Loopback only, fake data, harmless markers such as `zazzles-lab-marker`, no real secrets or files.
6. **Names in code stay neutral.** Code identifiers and paths describe the feature, not the flaw. The catalogue and the documentation hold the answers.
7. **Sample-sized.** If a concern only matters for an application that stays up, it does not belong here.

## Glossary

| Term | Meaning |
| --- | --- |
| SAST, SCA, DAST | Tools that read source code, check dependency versions, and probe a running application |
| CWE, CVE, GHSA | Dictionaries: weakness *types* (CWE-89 is SQL injection), publicly disclosed *vulnerabilities*, and GitHub *advisory* IDs |
| source, sink, flow | Where attacker-controlled data enters, the dangerous operation it must not reach, and the path between them |
| scenario | One deliberate weakness: an ID, a vulnerable operation, its protected counterparts, documentation and tests |
| safe operation | Part of the functional baseline, or a protected counterpart |
| vulnerable operation | A GraphQL field, a REST endpoint, or a setting that carries a scenario |
| protected counterpart (safe control) | An operation that receives the identical payload and keeps it inert |
| subgraph | One service's part of the federated GraphQL schema |
| gateway | The only public listener; composes the subgraphs and forwards REST calls |
| h2c | HTTP/2 without TLS, as used between the gateway and the Fastify services |
| ephemeral | Gone when the application stops. Said of the application and of its stores |
| marker | A harmless value that proves code ran (`42`, `zazzles-lab-marker`) |
| workspace | One package in the pnpm workspace: `apps/gateway`, `apps/accounts`, `apps/trading`, `apps/notifications`, or a shared library |
| step | One deliverable of the build order: one specification, one branch, one pull request |

## Related documents

- [project-plan.md](project-plan.md) — why the lab exists and what was decided
- [implementation-plan.md](implementation-plan.md) — the build order
- [services/README.md](services/README.md) — the contract of each service
- [scenario-catalog.md](scenario-catalog.md) — every designed scenario
- [../architecture/project.md](../architecture/project.md) — the system shape, and what follows from the application being ephemeral
- [`docs/architecture.md`](../../docs/architecture.md) — the same shape for readers of the lab
