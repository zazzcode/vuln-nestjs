# Repository layout

**Status:** written in Step 0. Versions were read from the npm registry on 2026-11-26; the scaffolding installs them, confirms them and pins them.

## 1. Shape

One repository, a pnpm workspace, one package per service.

```text
vuln-nestjs/
├── apps/
│   ├── gateway/              Fastify, HTTP/1.1 at the edge, Apollo gateway
│   ├── accounts/             Fastify, HTTP/2, MongoDB, Apollo subgraph
│   ├── trading/              Fastify, HTTP/2, MySQL, Apollo subgraph
│   └── notifications/        Express, HTTP/1.1, SQLite, Apollo subgraph
├── libs/                     shared TypeScript libraries, one package each
│   ├── config/               typed configuration and the service registry
│   ├── http2/                the HTTP/2 fetch and JSON client
│   ├── internal-auth/        guards, decorators, the service-token check
│   ├── lab-data/             the fixed identifiers of the fake users, the markets' starting prices
│   └── testing/              helpers: start the lab, sign in, call the graph
├── catalog/
│   └── catalog.json          the scenarios. Single source of truth
├── postman/                  the collection and its environment
├── scripts/                  the launcher, the scenario and audit checks
├── tests/
│   ├── e2e/                  whole-lab tests
│   └── expected-*.json       generated ground truth
├── docs/                     documentation for readers of the lab
├── .agents/skills/           the spec-builder and handoff skills, vendored from zazz-skills
├── .zazz/                    planning and working documents
├── .github/
│   ├── workflows/ci.yml
│   └── pull_request_template.md
├── package.json              workspace root: scripts, engines, packageManager
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

Each service is what the NestJS CLI produces, plus the lab's additions. `accounts` is the example, and the one that differs from the other two backend services: it has no entity file, because its documents are plain objects ([ADR-011](decisions/ADR-011-native-mongodb-driver-for-accounts.md)).

```text
apps/accounts/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/               the service's typed environment
│   ├── database/             the MongoDB client, the store's start and stop
│   ├── seed/                 the fake data
│   ├── health/               /internal/health and /internal/lab/reset
│   └── users/                one feature module
│       ├── users.module.ts
│       ├── user.model.ts     GraphQL object type
│       ├── user.input.ts     GraphQL input types
│       ├── users.repository.ts   the users collection, through the native driver
│       ├── users.resolver.ts
│       ├── users.service.ts
│       └── users.controller.ts   internal REST
├── test/                     integration tests
├── nest-cli.json
├── tsconfig.json
└── package.json              @zazzles/exchange-accounts
```

In `trading` and `notifications` the same place holds a TypeORM entity, `*.entity.ts`, and `database/` holds the TypeORM setup.

Why one package per service: [ADR-001](decisions/ADR-001-pnpm-workspace-monorepo.md).

## 2. Packages

| Workspace | Name |
| --- | --- |
| `apps/gateway` | `@zazzles/exchange-gateway` |
| `apps/accounts` | `@zazzles/exchange-accounts` |
| `apps/trading` | `@zazzles/exchange-trading` |
| `apps/notifications` | `@zazzles/exchange-notifications` |
| `libs/*` | `@zazzles/exchange-<name>` |

A service depends on a library directly. It never reaches into another service's source. Two services never share an entity, a DTO or a resolver: the federated schema is the only contract between them.

## 3. Tooling and versions

The versions are the latest published on 2026-11-26, checked against each other's declared peer ranges. The scaffolding re-checks them, because this stack moves, and pins what it installs.

| Concern | Package | Version |
| --- | --- | --- |
| Runtime | Node.js | 24 (24.21.0 was used for the checks). `engines: ">=24.11.0"`: TypeORM 1.1.3 requires 24.11 or later on that line |
| Package manager | pnpm | 12.23.0, declared in `packageManager`. Continuous integration installs it with `pnpm/action-setup`; the tests do not depend on how it was installed |
| Framework | `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`, `@nestjs/platform-express`, `@nestjs/testing` | 12.6.3 |
| | `@nestjs/cli` | 12.0.15 |
| | `@nestjs/schematics` | 12.0.17 |
| | `@nestjs/config` | 12.1.1 |
| GraphQL | `@nestjs/graphql`, `@nestjs/apollo` | 14.2.2 |
| | `@apollo/server` | 5.5.2 |
| | `@apollo/gateway` | 2.14.5 |
| | `@apollo/subgraph` | 2.17.0 |
| | `@as-integrations/fastify` | 3.1.0 |
| | `@as-integrations/express5` | 1.1.2 |
| | `graphql` | 16.15.0 |
| | `ts-morph` | 28.0.0 |
| Web framework | `fastify`, through `@nestjs/platform-fastify` | 5.12.8 |
| | `express`, through `@nestjs/platform-express` | 5.3.0 |
| Data | `typeorm` | 1.1.3. In `trading` and `notifications` only |
| | `@nestjs/typeorm` | 12.0.3. The same two |
| | `mongodb`, `mongodb-memory-server` | 7.9.1, 11.4.0. In `accounts` only, through the native driver ([ADR-011](decisions/ADR-011-native-mongodb-driver-for-accounts.md)) |
| | `mysql2`, `mysql-memory-server` | 3.24.6, 1.18.0 |
| | `sql.js` | 1.17.0 |
| Validation | `class-validator`, `class-transformer` | 0.15.1, 0.5.1 |
| Tokens | `@nestjs/jwt` (which brings `jsonwebtoken` 9.0.3) | 12.0.5 |
| Language | `typescript` | 6.0.3. The NestJS scaffold asks for `^6.0.2`. If the code-first schema generator does not work with it, 5.9.3, as in the official federation sample |
| Quality | `oxlint` (type-aware), `prettier` | The scaffold's versions |
| Tests | `vitest`, `supertest` | 5.1.2, 7.3.2 |
| | `newman` | 6.2.3 |

Three facts about these versions that the table alone does not show:

- **`graphql` is pinned to 16.** `@apollo/server` 5.5.2 declares `graphql` as `^16.11.0`. The official NestJS federation sample uses 17.1.0 with it, and the other packages accept both. 16.15.0 is inside every declared range.
- **NestJS 12 is ESM-only.** Relative imports end in `.js`. `__dirname` does not exist; `import.meta.dirname` does.
- **pnpm 12 has a minimum release age.** A package published more recently than that is held back. For versions pinned exactly it writes `minimumReleaseAgeExclude` into `pnpm-workspace.yaml` on its own. Expect that once, for the NestJS packages, and leave it.
- **NestJS Observe is left out.** The CLI scaffold adds `@nestjs/observe` and an `ObserveModule` with placeholder keys. Neither belongs in a lab that must not send telemetry. The scaffolding removes both.

## 4. Conventions

| Concern | Rule |
| --- | --- |
| Module system | ESM (`"type": "module"`) in every workspace, `module` and `moduleResolution` of `nodenext`, target `ES2023` |
| Decorators | `emitDecoratorMetadata` and `experimentalDecorators` on, which is what makes dependency injection by type work. `useDefineForClassFields` off, as in the official sample: with it on, a property declared without an initialiser (`id: number`) becomes an own property whose value is `undefined`, which changes how objects are serialized |
| Strictness | `strict: true`. `strictPropertyInitialization: false`, because DTOs and models are declared and then filled |
| Lint and format | oxlint with type-aware rules, and Prettier with single quotes and trailing commas: the NestJS 12 scaffold's settings |
| Versions | Exact, in every `package.json`. No carets. `saveExact: true` in `pnpm-workspace.yaml` |
| Install scripts | Off for everything, as in vuln-nextjs. The two database packages download at first use, not at install. pnpm 12 stops the install until the build scripts of `protobufjs` and `@apollo/protobufjs` are denied under `allowBuilds` in `pnpm-workspace.yaml` |
| Test names | `*.spec.ts` beside the code for unit tests. `*.int-spec.ts` in `test/` for integration. `*.e2e-spec.ts` under `tests/e2e/` |
| Mocks | Vitest's `vi.fn()`. Jest is not installed |
| Identifiers | Neutral names in code. No `vuln`, `unsafe` or `safe` in an identifier or a path |

## 5. Root scripts

Planned names. The scaffolding confirms them and records them in `docs/setup-and-testing.md`.

| Script | Does |
| --- | --- |
| `pnpm start` | Build if needed, generate the run's secrets, start the three backend services, wait for health, start the gateway. Runs in the foreground. Ctrl-C stops everything |
| `pnpm build` | Build every workspace |
| `pnpm lint`, `pnpm format` | oxlint, Prettier |
| `pnpm test` | Unit tests |
| `pnpm test:int` | Integration tests |
| `pnpm test:e2e` | End-to-end tests: the whole lab in the test process |
| `pnpm test:api` | Newman against a running stack |
| `pnpm scenario:check`, `pnpm scenario:update` | Ground truth for scenarios |
| `pnpm audit:check`, `pnpm audit:update` | Ground truth for dependencies |

## 6. Branches

One branch per deliverable, `phase-<n>-<slug>`, and one pull request. The workflow is in the [project plan](../project/project-plan.md#8-branch-and-pr-workflow).
