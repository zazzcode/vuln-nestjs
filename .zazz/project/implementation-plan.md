# Implementation plan

**Written:** 2026-11-26, after the design was agreed with the Project Owner
**Status:** current. Supersedes the phase list in the first draft of the [project plan](project-plan.md).

This is the build order, from an empty repository to a complete lab. The design is in the [service specifications](services/README.md); the reasoning is in the [architecture](../architecture/README.md).

## 1. Who does what

| Step | Who | Branch | Deliverable | Needs |
| --- | --- | --- | --- | --- |
| 0 | — | `phase-0-plan-and-architecture` | The plan, the architecture, the service specifications | Review |
| 1 Scaffolding | The lead agent | `phase-1-foundation` | The repository skeleton: every service starts, the graph is composed, every store is wired, the tests and CI run | Step 0 |
| 2 Services | One sub-agent per service, all four in parallel | `phase-2a-accounts`, `phase-2b-trading`, `phase-2c-notifications`, `phase-2d-gateway` | Each service, complete against its specification, with its tests | Step 1 |
| 3 Integration | The lead agent | `phase-3-integration` | End-to-end tests through the gateway, the complete Postman collection, the ground-truth checks green | Step 2, merged |
| 4 Dependency pins | One agent | `phase-4-dependencies` | The eight pins, the audit snapshot, the reachability statements | Step 3, merged |
| 5 Release | The lead agent | `phase-5-release` | A full verification from a clean clone, the finished documentation, the tag | Step 4, merged |

Step 2 is parallel because the services never call each other. Each one is built, and tested, on its own.

**Before Step 2 starts**, the Project Owner turns off Dependabot security updates for the repository. Three of the vulnerable pins are installed in Step 2, because their scenarios are not exploitable without them, and GitHub would otherwise open a pull request against each.

## 2. Step 1 — scaffolding

"Complete" means all of this is true, and has been run:

| Area | What exists |
| --- | --- |
| Workspace | `package.json` with the scripts and the engines, `pnpm-workspace.yaml`, `tsconfig.base.json`, oxlint, Prettier, a lockfile. `pnpm install`, `pnpm lint` and `pnpm build` succeed from a clean clone |
| Libraries | `libs/config` (typed environment, the service registry), `libs/http2` (the HTTP/2 fetch and the JSON client), `libs/internal-auth` (the guards and decorators), `libs/lab-data` (the fixed identifiers of the fake users, and the markets' starting prices, shared by every seed module), `libs/testing` (start and stop the lab from a test) |
| Four applications | For each of `gateway`, `accounts`, `trading`, `notifications`: `main.ts`, `app.module.ts`, configuration, the store's start and stop, health and reset on `/internal/*`, the GraphQL module, one feature module as the pattern to copy, a unit test and an integration test |
| The graph | The gateway composes the three subgraphs and answers a query whose fields come from all three |
| Stores | MongoDB, MySQL and SQLite in memory, each with one real record seeded at start: a collection of documents in `accounts`, a table in `trading` and in `notifications` |
| Ground truth | `catalog/catalog.json` with its schema, `pnpm scenario:check`, `scenario:update`, `audit:check`, `audit:update` |
| Tests | Unit, integration and end-to-end suites run with one command each. The end-to-end suite proves the HTTP versions and a clean stop |
| Running | `pnpm start` starts the lab in order and stops it, engines included |
| API collection | A Postman collection and environment, run under Newman by `pnpm test:api` |
| CI | `.github/workflows/ci.yml`: install, lint, unit, integration, build, end-to-end, Newman, audit information, audit ground truth |
| Documentation | `docs/setup-and-testing.md`, with every command run before it was written |

## 3. Step 2 — the services, in parallel

### Ownership

A sub-agent writes only inside its own service:

| Sub-agent | May write | Reads, never writes |
| --- | --- | --- |
| accounts | `apps/accounts/`, `docs/vulnerabilities/` modules for its scenarios | everything else |
| trading | `apps/trading/`, its documentation modules | everything else |
| notifications | `apps/notifications/`, its documentation modules | everything else |
| gateway | `apps/gateway/`, its documentation modules | everything else |

The lead agent owns everything shared: `libs/`, `catalog/`, `tests/`, `postman/`, `scripts/`, the root configuration, `AGENTS.md`. A sub-agent that needs a change there stops and asks. This is what makes four parallel sub-agents safe: no two of them ever edit the same file.

The gateway's pass-through controllers need the `/internal/*` contract of the other three. They are written from the service specifications, not from the other sub-agents' code. The gateway's own tests mock the services. Its end-to-end tests wait for Step 3.

### Order of work inside a service

1. **Store, fake data, health.** The entities (collections, in `accounts`), the seed module, `GET /internal/health`, `POST /internal/lab/reset`. An integration test proves a round trip to the store.
2. **Safe operations.** Every safe operation in the specification's API tables, with a functional test for each.
3. **Vulnerable operations.** Every vulnerable operation, with a both-directions test for each of its scenarios.
4. **Documentation and catalogue.** One documentation module per scenario, with a reproduction that has been run. Catalogue entries for every scenario, counterpart included. Snapshots regenerated.

Step 2 is committed and pushed before Step 3 starts, so that the safe baseline exists on its own and can be reviewed as ordinary code.

### What a service must show to be done

- Every operation in its specification exists, with the name, the caller and the behaviour its row gives.
- For every scenario: one payload, sent to the vulnerable operation and to each protected counterpart. The exploit assertion names what was gained. The counterpart assertion names why it was refused.
- Every scenario has an ID in the catalogue, a marker on its vulnerable line, and a documentation module.
- The service's tests start the service alone. No other service is running.
- `pnpm lint`, `pnpm build`, the unit, the integration and the scenario checks pass.
- After the service stops, no database process and no temporary directory remain.
- The counts in the specification match the code: the number of safe and of vulnerable operations.

## 4. Step 3 — integration

- `tests/e2e/`: the whole lab in the test process. Every scenario that crosses a service boundary. The 13 gateway scenarios. A query that joins all three services. The HTTP versions. Reset. A clean stop.
- The Postman collection, one folder per service, one request per scenario.
- `pnpm scenario:check` and `pnpm audit:check` green in CI.
- `docs/vulnerabilities/index.md` becomes the table of every scenario.

## 5. Step 4 — the dependency pins

The eight pins in [`docs/vulnerabilities/dependencies.md`](../../docs/vulnerabilities/dependencies.md), one workspace each, installed and confirmed. For each, a statement of whether a run-time path reaches the vulnerable function, and a test where one does. The audit snapshot is regenerated in the same commit as the pins.

## 6. Step 5 — release

A fresh clone, installed, started, exercised and stopped, against every success criterion of the [project plan](project-plan.md#4-success-criteria). The evidence goes in the pull request. Then the tag `v1.0.0`.

## 7. Conventions for every step

- Branch from the step's base, one branch and one pull request per deliverable, opened as a draft with its specification as the first commit. The Project Owner merges.
- A specification is written with the `spec-builder` skill, in [`.agents/skills/`](../../.agents/skills/README.md), and lives in [`.zazz/specifications/`](../specifications/README.md).
- The invariants in [AGENTS.md](../../AGENTS.md) hold: a vulnerability is never fixed, a pin is never upgraded, the safety rails stay, nothing is added that only matters for an application that stays up.
- A command is written into the documentation only after it has been run.

## 8. Facts from the spike of 2026-11-26

A throwaway project was built and run to answer one question: does GraphQL federation work on Fastify? It does. A gateway on Fastify composed a Fastify subgraph and an Express subgraph and answered a query that joins them. The Fastify subgraph received every gateway request over `HTTP/2.0`; the Express subgraph over `HTTP/1.1`.

Things learned that the scaffolding needs:

| Fact | Consequence |
| --- | --- |
| pnpm 12 refuses to install the Apollo gateway until the build scripts of `protobufjs` and `@apollo/protobufjs` are allowed or denied. `pnpm-workspace.yaml` needs `allowBuilds` with both set to `false` | They only build a browser bundle the lab does not need |
| pnpm 12 wrote `minimumReleaseAgeExclude` for every NestJS 12.6.3 package on its own, because those versions were hours old | Expected once, for packages younger than pnpm's minimum release age |
| `IntrospectAndCompose` has no `fetcher` per subgraph. Schema discovery and every query go through the data source from `buildService` | The transport is decided in `buildService`, once |
| The gateway's `Fetcher` type is narrower than the global `fetch`. TypeScript rejects passing `fetch` without a cast | Cast once, in `libs/http2` |
| An entity reference from a parent object needs `@provides(fields: "id")` on the field, or composition fails with "the key field(s) cannot be resolved from subgraph" | `Order.user` carries it. The scaffolding's example does too |
| Apollo Server returns a stack trace in every error unless `NODE_ENV` is `production` | True from the first line of gateway code. It is scenario GQL-004 |
| NestJS's Express adapter creates an `http` or an `https` server and nothing else | The Express service speaks HTTP/1.1 |
| With `http2: true`, `request.raw.httpVersion` is `"2.0"` | That is how a test proves the protocol |
| The GraphQL driver writes no schema file unless `autoSchemaFile` has a `path` | Each service sets one, resolved from its own directory, so the file lands at `apps/<service>/schema.gql` whatever the working directory |
| `accounts` does not use TypeORM | Decided by the Project Owner on 2026-11-26 ([ADR-011](../architecture/decisions/ADR-011-native-mongodb-driver-for-accounts.md)). MongoDB is reached through the native `mongodb` driver, so nothing has to be proven about TypeORM and MongoDB |

The spike used schema-first GraphQL definitions. The lab is code first. The scaffolding checked the code-first generator with TypeScript 6.0.3 on 2026-11-26: it works, and no fallback to TypeScript 5.9.3 is needed.
