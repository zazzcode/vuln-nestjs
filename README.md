# vuln-nestjs

A deliberately vulnerable NestJS application for testing the tools that find security weaknesses in source code and in running web applications (SAST, SCA and DAST). The application is **VCX (Vulnerable Crypto Exchange)**, a small fake cryptocurrency exchange built as NestJS microservices: one gateway that serves a federated GraphQL schema, and three backend services for accounts, trading and notifications.

VCX is the application's name, whatever it is written in. This repository, `vuln-nestjs`, is its NestJS implementation.

> ⚠️ **This application is intentionally vulnerable.** It is a sample that is started, preloaded with fake data, exercised, and shut down. Run it only on a machine you control, on `127.0.0.1`, and stop it afterwards. Never deploy it or expose it on a network.

## Objective

A scanner is only as good as the evidence behind it. The objective of this repository is to give a scanner a target that behaves like real software and whose every weakness is known, so that a report can be scored:

- every deliberate weakness has a stable ID and a documented expected finding;
- every one has an automated test proving it is exploitable;
- every one has a protected counterpart that handles the identical payload safely, and the lab keeps about one and a half safe operations for every vulnerable one;
- the source hashes, the scanner expectations and the dependency audit are committed as ground truth, so a miss is a false negative and a report against clean code is a false positive.

The application uses the stack the scanner is being tested against: [NestJS](https://docs.nestjs.com/) ([source on GitHub](https://github.com/nestjs)) with the Fastify adapter and the Express adapter, [GraphQL federation](https://docs.nestjs.com/graphql/federation), HTTP/2 between the gateway and the Fastify services, TypeORM, MongoDB, MySQL and SQLite.

## What kind of application it is

This is a sample, not a running service.

| Step | What happens |
| --- | --- |
| Start | One command starts the three backend services. Each starts its own in-memory database and loads fake data. Then the gateway starts |
| Exercise | A test, a scanner, or a person with curl or Postman calls the gateway. `POST /api/v1/lab/reset` loads the fake data again at any time |
| Stop | Everything stops and the data is gone. The machine is as it was |

Because the whole application is ephemeral, nothing persists, nothing is migrated, and anything an exploit breaks is undone by a reset. That is also why the exploits can be real: they run against disposable data.

## The system

| Service | Adapter | Owns | Store | Listener |
| --- | --- | --- | --- | --- |
| `gateway` | Fastify | The federated GraphQL schema, REST pass-through. The only public listener | none | `127.0.0.1:3000`, HTTP/1.1 |
| `accounts` | Fastify | Users, sign-in, sessions, profile, documents | MongoDB, in memory | `127.0.0.1:3101`, HTTP/2 |
| `trading` | Fastify | Markets, prices, wallets, deposits, orders, trades, reports | MySQL, in memory | `127.0.0.1:3102`, HTTP/2 |
| `notifications` | Express | Price alerts, webhook deliveries, announcements | SQLite, in memory | `127.0.0.1:3103`, HTTP/1.1 |

It is a star: the gateway talks to every service, and services never call each other, so that each can be built and tested on its own.

Five coins can be bought and sold for dollars: BTC, ETH, SOL, XRP and DOGE. Five users and an administrator are loaded at every start. The administrator creates accounts and credits dollars; the users buy, sell and set price alerts.

The design and its reasoning are in [`docs/architecture.md`](docs/architecture.md) and in [`.zazz/architecture/`](.zazz/architecture/README.md). The API of each service is in its [specification](.zazz/project/services/README.md).

## What it will cover

77 designed weaknesses across the OWASP Top 10 and the OWASP API Security Top 10, with SQL injection, NoSQL injection, prototype pollution and stored XSS among them. Plus 8 libraries pinned to vulnerable versions, one service at a time, so a scanner has to say which service is affected.

- **Injection** — SQL injection through TypeORM, NoSQL operator injection, command and argument injection, template injection, unsafe deserialization, `eval`, spreadsheet formulas, log lines.
- **Prototype pollution** — a dotted path walked without checks, a parsed string deep-merged, a vulnerable library.
- **Cross-site scripting** — stored, in an announcement page, an uploaded file and an admin page; reflected, in a status page.
- **Access control** — object, function and property level, including what federation adds: entity references built from caller input.
- **Authentication** — token verification, lockout, enumeration, sessions.
- **GraphQL itself** — introspection, unbounded depth, batched requests, error detail.
- **Business logic** — negative amounts, a withdrawal race, a caller's price, a double fill.
- **Request forgery and files** — webhook and avatar URLs, path traversal, unrestricted upload.
- **Vulnerable dependencies** — eight pins with their advisories.

The IDs are in [`.zazz/project/scenario-catalog.md`](.zazz/project/scenario-catalog.md). As scenarios are built, each gets a write-up in [`docs/vulnerabilities/`](docs/vulnerabilities/index.md).

## Status

**The scaffolding is built; the scenarios are being built.** The application starts, loads its fake data, answers and stops cleanly. It holds none of its designed weaknesses yet: each arrives with the service it belongs to, in that service's pull request.

| Milestone | Step | Status |
| --- | --- | --- |
| M1 Running skeleton | 1, the scaffolding | Built. Open as a draft for review: [pull request 2](https://github.com/zazzcode/vuln-nestjs/pull/2) |
| M2 The services | 2, one sub-agent per service | In progress. One branch and one draft pull request per service |
| M3 Measurable | 3, integration | Not started |
| M4 Complete vulnerability lab | 4, the dependency pins | Not started |
| M5 Released | 5 | Not started |

The build order is in [`.zazz/project/implementation-plan.md`](.zazz/project/implementation-plan.md).

## Documentation

| Document | For |
| --- | --- |
| [`docs/README.md`](docs/README.md) | Everyone who uses the lab: architecture, vulnerabilities, setup and testing |
| [`docs/architecture.md`](docs/architecture.md) | How the system is put together, and why |
| [`docs/vulnerabilities/index.md`](docs/vulnerabilities/index.md) | The scenario families, and how each one will be documented |
| [`docs/vulnerabilities/dependencies.md`](docs/vulnerabilities/dependencies.md) | The vulnerable dependency pins and their advisories |
| [`.zazz/README.md`](.zazz/README.md) | Everyone who builds the lab: plan, architecture, specifications |
| [`.zazz/project/services/`](.zazz/project/services/README.md) | A specification per service: its API, its designed weaknesses, their protected counterparts |
| [`AGENTS.md`](AGENTS.md) | Coding agents: the invariants and the workflow |
| [`SECURITY.md`](SECURITY.md) | What is deliberately vulnerable, and the rules for running the lab |

## Repository layout

```text
├── docs/               documentation for readers of the lab
├── .zazz/              planning and working documents
│   ├── project/        orientation, plan, requirements, services/, scenario catalogue, notes
│   ├── architecture/   system design and decision records
│   └── specifications/ one deliverable specification per step
├── .agents/skills/     the spec-builder and handoff skills, vendored from zazz-skills
├── .github/            pull request template
├── AGENTS.md
├── SECURITY.md
└── LICENSE
```

The layout the repository will have after the scaffolding is in [`.zazz/architecture/repository-layout.md`](.zazz/architecture/repository-layout.md).

## Setup and run

```bash
git clone https://github.com/zazzcode/vuln-nestjs.git
cd vuln-nestjs
pnpm install --frozen-lockfile
pnpm build
git config core.hooksPath .githooks
pnpm start
```

It needs Node 24.11 or later and pnpm 12.23.0. The `git config` line enables a pre-push hook that refuses a push failing lint, the format check or the unit tests. `pnpm start` starts the lab and stops it on Ctrl-C, leaving nothing behind. Every command, with what it printed, is in [`docs/setup-and-testing.md`](docs/setup-and-testing.md).

## How the work is organized

Each step is one feature branch and one pull request, opened as a draft with its specification as the first commit. Implementation starts after the specification is approved, and the Project Owner reviews and merges. The workflow is in [`.zazz/README.md`](.zazz/README.md).

## Related

- [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs): the same approach for Next.js. This lab carries over its conventions: stable IDs, protected counterparts, generated ground truth.
- [NestJS documentation](https://docs.nestjs.com/) and [NestJS on GitHub](https://github.com/nestjs).
- [NestJS GraphQL federation sample](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first) and [GraphQL API example](https://github.com/nestjs/example-graphql-api): the code-first patterns this lab follows.
- [Zazz methodology](https://github.com/zazzcode/zazz-skills): the process `.zazz/` follows, adapted.

## License

MIT. See [LICENSE](LICENSE).
