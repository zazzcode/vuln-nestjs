# vuln-nestjs

A deliberately vulnerable NestJS application for testing the tools that find security weaknesses in source code and in running web applications (SAST, SCA and DAST). The application is **Zazzles Exchange**, a small fake cryptocurrency exchange built as NestJS microservices: one gateway that serves a federated GraphQL schema, and three backend services for accounts, trading and notifications.

> ⚠️ **This application is intentionally vulnerable.** It is a sample that is started, preloaded with fake data, exercised, and shut down. Run it only on a machine you control, on `127.0.0.1`, and stop it afterwards. Never deploy it or expose it on a network.

## Objective

A scanner is only as good as the evidence behind it. The objective of this repository is to give a scanner a target that behaves like real software and whose every weakness is known, so that a report can be scored:

- every deliberate weakness has a stable ID and a documented expected finding;
- every one has an automated test proving it is exploitable;
- where it is meaningful, it has a protected counterpart that handles the identical payload safely;
- the source hashes, the scanner expectations and the dependency audit are committed as ground truth, so a miss is a false negative and a report against clean code is a false positive.

The application uses the stack the scanner is being tested against: [NestJS](https://docs.nestjs.com/) ([source on GitHub](https://github.com/nestjs)) with the Fastify adapter and the Express adapter, [GraphQL federation](https://docs.nestjs.com/graphql/federation), HTTP/2 between services, TypeORM, MongoDB, MySQL and SQLite.

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
| `accounts` | Fastify | Users, sessions, wallets, deposits, withdrawals, the ledger | MongoDB, in memory | `127.0.0.1:3101`, HTTP/2 |
| `trading` | Fastify | Markets, orders, the order book, trades, price ticks | MySQL, in memory | `127.0.0.1:3102`, HTTP/2 |
| `notifications` | Express | Price alerts, webhook deliveries, announcements | SQLite, in memory | `127.0.0.1:3103`, HTTP/1.1 |

Five coins can be bought and sold for dollars: BTC, ETH, SOL, XRP and DOGE. Five users and an administrator are loaded at every start. The administrator creates accounts and credits dollars; the users buy, sell and set price alerts.

The design and its reasoning are in [`docs/architecture.md`](docs/architecture.md) and in [`.zazz/architecture/`](.zazz/architecture/README.md).

## What it will cover

The planned catalogue has 72 active scenarios across the OWASP Top 10 and the OWASP API Security Top 10, plus 5 negative controls that a scanner should not report. Among the families:

- **Injection** — SQL injection through TypeORM, NoSQL operator injection, command and argument injection, template injection, unsafe deserialization.
- **Access control** — object, function and property level authorization, including what federation adds: entity resolution and references built from caller input.
- **Authentication** — token verification, throttling, enumeration, sessions.
- **GraphQL itself** — introspection, unbounded depth, batched mutations, error detail.
- **Business logic** — negative amounts, withdrawal races, caller-supplied prices.
- **Request forgery and files** — webhook and avatar URLs, path traversal, unrestricted upload.
- **Vulnerable dependencies** — eight libraries pinned to vulnerable versions, one service at a time, so a scanner has to say which service is affected.

The plan for each one is in [`.zazz/project/scenario-catalog.md`](.zazz/project/scenario-catalog.md). As scenarios ship, each gets a write-up in [`docs/vulnerabilities/`](docs/vulnerabilities/index.md).

## Status

**Phase 0: planning.** There is no application code in this repository yet and nothing that can be run. The project plan, the architecture and the planned catalogue are written and wait for review.

| Milestone | Phases | Status |
| --- | --- | --- |
| M1 Running skeleton | 1 | Not started |
| M2 Functional exchange | 2, 3, 4 | Not started |
| M3 Measurable | 5 | Not started |
| M4 Complete vulnerability lab | 6, 7, 8, 9 | Not started |
| M5 Released | 10 | Not started |

The phases, their deliverables and their exit criteria are in [`.zazz/project/project-plan.md`](.zazz/project/project-plan.md).

## Documentation

| Document | For |
| --- | --- |
| [`docs/README.md`](docs/README.md) | Everyone who uses the lab: architecture, vulnerabilities, setup and testing |
| [`docs/architecture.md`](docs/architecture.md) | How the system is put together, and why |
| [`docs/vulnerabilities/index.md`](docs/vulnerabilities/index.md) | The scenarios, and how each one will be documented |
| [`docs/vulnerabilities/dependencies.md`](docs/vulnerabilities/dependencies.md) | The vulnerable dependency pins and their advisories |
| [`.zazz/README.md`](.zazz/README.md) | Everyone who builds the lab: plan, architecture, specifications |
| [`AGENTS.md`](AGENTS.md) | Coding agents: the invariants and the workflow |
| [`SECURITY.md`](SECURITY.md) | What is deliberately vulnerable, and the rules for running the lab |

## Repository layout

```text
├── docs/               documentation for readers of the lab
├── .zazz/              planning and working documents
│   ├── project/        orientation, plan, requirements, scenario catalogue, notes
│   ├── architecture/   system design and decision records
│   └── specifications/ one deliverable specification per phase
├── .github/            pull request template
├── AGENTS.md
├── SECURITY.md
└── LICENSE
```

The layout the repository will have after Phase 1 is in [`.zazz/architecture/repository-layout.md`](.zazz/architecture/repository-layout.md).

## Setup and run

There is nothing to install or run yet. Phase 1 adds the application, the one-command start and stop, and the tests, and records every command in `docs/setup-and-testing.md` after it has been run.

Today the repository can only be read:

```bash
git clone https://github.com/zazzcode/vuln-nestjs.git
```

## How the work is organized

Each phase is one feature branch and one pull request, opened as a draft with its specification as the first commit. Implementation starts after the specification is approved, and the Project Owner reviews and merges. The workflow is in [`.zazz/README.md`](.zazz/README.md) and in the [project plan](.zazz/project/project-plan.md#8-branch-and-pr-workflow).

## Related

- [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs): the same approach for Next.js. This lab carries over its conventions — stable IDs, protected counterparts, generated ground truth.
- [NestJS documentation](https://docs.nestjs.com/) and [NestJS on GitHub](https://github.com/nestjs).
- [NestJS GraphQL federation sample](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first) and [GraphQL API example](https://github.com/nestjs/example-graphql-api): the code-first patterns this lab follows.
- [Zazz methodology](https://github.com/zazzcode/zazz-skills): the process `.zazz/` follows, adapted.

## License

MIT. See [LICENSE](LICENSE).
