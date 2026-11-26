# Stack findings

Date-time: 2026-11-26T15-38-03Z (10:38:03, UTC-5).

What was measured on 2026-11-26 while planning, so that no phase has to rediscover it. The versions are in [repository-layout.md](../../architecture/repository-layout.md) and the advisories in [`docs/vulnerabilities/dependencies.md`](../../../docs/vulnerabilities/dependencies.md). This note holds what those pages leave out, and what was not verified.

## NestJS 12

- The current line is 12.6.3. `@nestjs/platform-fastify` 12.6.3 was published on 2026-11-26 at 11:06 UTC, hours before this note. The line is three months old: 12.0.0 followed on 2026-08-27.
- Nest's packages are ESM-only. A new project has `"type": "module"`, `module` and `moduleResolution` of `nodenext`, relative imports that end in `.js`, and no `__dirname`.
- Tests run on Vitest. Unit tests are `*.spec.ts` beside the code; the end-to-end test is `test/*.e2e-spec.ts`. Jest is not installed.
- Lint is oxlint, type-aware. Format is Prettier.
- The CLI's own version is not the framework's: the latest `@nestjs/cli` is 12.0.15, while `@nestjs/core` is 12.6.3.
- `@nestjs/graphql` 14.2.2 declares `typescript` as `^5.5.0 || ^6.0.0`. TypeScript 7 is published and is not supported.
- The documentation now recommends `@nestjs/platform-node`, a third adapter without a framework, from 12.3 on. It becomes the default in NestJS 13. The lab does not use it: the request was for Fastify.
- **The scaffold wires in telemetry.** `nest new` adds `@nestjs/observe`, an `ObserveModule.forRoot` with the placeholder keys `YOUR_APP_KEY` and `YOUR_APP_SECRET`, and an `AGENTS.md` that tells agents to ask the owner to link the app to observe.nestjs.com. Nothing is sent until the app is linked. The lab removes all of it: a lab with a hard-coded placeholder secret and an outbound telemetry SDK would put noise into every scan.
- `@nestjs/authentication` is at 0.1.8 and `@nestjs/authorization` at 0.1.4. The JWT tutorial is built on them, with Zod schemas and `StandardSchemaValidationPipe`. The lab stays with `@nestjs/jwt`, custom guards and class-validator ([ADR-007](../../architecture/decisions/ADR-007-auth-and-validation-patterns.md)).

## GraphQL

- The drivers are no longer in `@nestjs/graphql`. Apollo lives in `@nestjs/apollo` and Mercurius in `@nestjs/mercurius`. `ApolloFederationDriver` and `ApolloGatewayDriver` are imported from `@nestjs/apollo`.
- `@nestjs/apollo` 14 requires Apollo Server 5. Apollo is mounted through an integration package: `@as-integrations/fastify` 3.1.0 or `@as-integrations/express5` 1.1.2.
- **A peer range disagrees with the official sample.** `@apollo/server` 5.5.2 declares `graphql` as `^16.11.0`. The official federation sample pins `graphql` 17.1.0 with it. The lab pins 16.15.0, which is inside every declared range. If Phase 1 finds a reason to use 17, that is a deliberate deviation.
- The official sample (`sample/31-graphql-federation-code-first`) composes the supergraph into a file before the gateway starts, with `LocalCompose`, and its end-to-end test asserts that `IntrospectAndCompose` is not used. The lab uses `IntrospectAndCompose` at start anyway: for an application that lives for minutes, one command matters more than a composition step.
- The NestJS documentation says of Mercurius that it "doesn't fully support Federation 2".
- The gateway does not forward subscriptions to subgraphs.
- In the typings of `@apollo/gateway` 2.14.5, `GatewayConfigBase` has `buildService` and `fetcher`, and `RemoteGraphQLDataSource` takes a `fetcher` and has `willSendRequest`. So an HTTP/2 transport for every subgraph fetch is expressible. It has not been run.

## Adapters and transports

- `@nestjs/platform-fastify` 12.6.3 depends on `fastify` 5.12.8 and `@nestjs/platform-express` 12.6.3 on `express` 5.3.0, both exact. An older Fastify inside a service therefore means an older adapter.
- The Express adapter's `initHttpServer` creates an `http` or an `https` server and nothing else. There is no HTTP/2 option.
- `@nestjs/microservices` has no HTTP/2 transport. Its choices are TCP (the default), Redis, NATS, MQTT, Kafka, RabbitMQ, gRPC and a custom strategy.

## Advisories worth knowing before Phase 9

- `@nestjs/platform-fastify` has had six advisories about middleware bypasses on Fastify between 2025 and 2026: URL encoding (three, one of them a duplicate), HEAD requests, trailing slash, absolute-form request targets. Each fixed in a patch release. The lesson for the lab: authorization that depends on path-scoped middleware is fragile in a way that authorization in guards is not, and that is a fair thing for a scanner to notice.
- `fastify` 5.12.1 carries five advisories, four of them fixed in 5.12.2 and one, the HTTP/2 trailer denial of service, in 5.12.5. `@nestjs/platform-fastify` 12.0.1 pins that Fastify, which is why it is the SCA-008 candidate.
- `express` 5.3.0, `multer` 2.5.0, `typeorm` 1.1.3, `graphql` 16.15.0 and the two Apollo integrations have no advisory. The baseline should audit clean, which makes every Phase 9 finding attributable to a pin.
- GitHub has advisories from 2026 for packages that were quiet for years: `lodash` (CVE-2025-13465, CVE-2026-4800), `qs` (CVE-2026-82417), `mysql2` (two without CVE IDs). A snapshot taken today will not be the snapshot in a year.

## Stores

- **`mongodb-memory-server` is not in memory with current MongoDB.** In `mongodb-memory-server-core` 11.4.0, `getStorageEngine` returns `wiredTiger` for MongoDB 7.0 and later and `ephemeralForTest` only for older versions. MongoDB 7.0 removed `ephemeralForTest`. The server runs against a temporary directory, which is removed on stop. The same is true of the MongoDB in vuln-nextjs, whose README describes it as a real in-memory MongoDB.
- `mysql-memory-server` 1.18.0: `createDB({ version, dbName, port, … })` resolves to `{ port, username, dbName, stop }`, the user's password is empty, and the binary comes from `cdn.mysql.com`. It is ephemeral in the same way: a real engine, a temporary directory.
- TypeORM: 1.1.3 needs Node `^20.19.0 || ^22.13.0 || >=24.11.0`. The 0.3 line is still maintained (0.3.31, 2026-07-13). Its documentation says it has "basic MongoDB support" with driver v7 or later.

## Not verified

- That the gateway driver runs on the Fastify adapter at all, with or without HTTP/2.
- That `FastifyAdapter({ http2: true })` works with the Apollo integration mounted on it.
- That the Apollo integration for Express 5 works inside a federation subgraph.
- That TypeORM 1.1.3 can read and write one entity through its MongoDB repository.
- The size and the download time of the `mysqld` binary.
- That `mysql2` 3.9.3 works with TypeORM 1.1.3, which declares `^3.15.3`.
- That `@nestjs/platform-fastify` 12.0.1 interoperates with `@nestjs/core` 12.6.3.
- That any vulnerable pin installs under pnpm 12.

Phase 1 takes the first five. Phase 9 takes the last three.
