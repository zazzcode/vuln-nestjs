# Scenario catalogue — plan

The catalogue of deliberate weaknesses this lab will contain. Once a scenario ships, its entry in `catalog/catalog.json` (Phase 5) is the source of truth and its write-up in [`docs/vulnerabilities/`](../../docs/vulnerabilities/index.md) is the documentation. This document is the plan: which families exist, what each scenario will be, where it will live, and in which phase it ships.

**IDs are provisional until the scenario ships.** The specification of each phase confirms the IDs it delivers.

## Conventions

Carried over from [vuln-nextjs](https://github.com/zazzcode/vuln-nextjs), with changes for this stack.

- **ID:** `<FAMILY>-<number>` (`SQL-003`). Permanent once shipped; evaluations refer to it.
- **A scenario is an operation.** In vuln-nextjs a scenario was a route file. Here it is a GraphQL field or a REST handler, in its own resolver, controller or service file.
- **Vulnerable operation and protected counterpart live in separate files.** The counterpart receives the identical payload and keeps it inert. Where the functional baseline already implements the safe version, that is the counterpart.
- **Status:** `active` for a deliberate weakness; `demonstration` for a negative control, where no finding is expected.
- **Scanner:** `SAST` for weaknesses in application code, `SCA` for vulnerable dependency versions.
- **Surface:** `graphql` (an operation on the federated schema at the gateway), `rest` (a gateway REST endpoint), `internal` (a call between services, or a backend service reached directly).
- **Names in code are neutral.** Identifiers and paths describe the feature (`creditWallet`, `ledger.ts`). The catalogue holds the answer.
- **Sink marker:** the vulnerable line carries a comment such as `// SQL-003 / CWE-89: …`. See open question Q5 in the [project plan](project-plan.md#10-open-questions).
- **OWASP column:** the OWASP Top 10 (2021) category and the OWASP API Security Top 10 (2023) category, as `A03 · API3`.

## Families

| Family | Covers | OWASP Top 10 | OWASP API | Active | Phases |
| --- | --- | --- | --- | --- | --- |
| `AUTH` | Authentication and sessions: token verification, throttling, enumeration | A02, A07 | API2 | 5 | 6 |
| `ACCESS` | Authorization: object, function and property level; trusted headers | A01 | API1, API3, API5, API10 | 6 | 5, 6, 7, 8 |
| `SQL` | SQL injection through TypeORM and the MySQL driver | A03 | API3 | 4 | 7 |
| `MONGO` | NoSQL operator injection and operator mass assignment | A03 | API3 | 6 | 5, 6 |
| `OS` | Command and argument injection | A03 | — | 2 | 8 |
| `DESER` | Unsafe deserialization, `eval`, template injection | A03, A08 | — | 3 | 6, 8 |
| `FS` | Path traversal and unrestricted upload | A01, A04 | — | 3 | 7, 8 |
| `SSRF` | Server-side request forgery | A10 | API7 | 3 | 8 |
| `REDIR` | Open redirect | A01 | — | 1 | 8 |
| `COOKIE` | Cookie attributes and CSRF | A05, A07 | — | 3 | 6, 8 |
| `INJECT` | HTML, header and spreadsheet-formula injection | A03 | — | 4 | 7, 8 |
| `LOGIC` | Business logic: negative amounts, races, precision | A04 | API6 | 5 | 5, 6, 7 |
| `GQL` | GraphQL-specific exposure and resource issues | A01, A05 | API1, API3, API4, API6, API8, API9 | 7 | 8 |
| `CONFIG` | Security misconfiguration at the gateway | A05 | API8, API9 | 4 | 8 |
| `CRYPTO` | Weak hashing, weak randomness, hard-coded secrets | A02 | — | 3 | 6 |
| `RE` | Regular expression denial of service | A03 | — | 1 | 6 |
| `RES` | Unrestricted resource consumption | A05 | API4 | 2 | 6, 7 |
| `INFO` | Information exposure through logs and errors | A07, A09 | API8 | 2 | 6, 8 |
| `SCA` | Vulnerable dependency versions | A06 | — | 8 | 9 |

**Total: 72 active scenarios**, plus the 5 negative controls below.

Together the families cover every category of both OWASP lists, which success criterion SC4 requires.

## Planned scenarios

### `AUTH` — authentication and sessions

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-001 | A JWT is verified without pinning the algorithm, so a token signed with another algorithm is accepted | accounts | rest | CWE-347 | A02 · API2 | 6 |
| AUTH-002 | A token is decoded with `jwt.decode` and trusted as authenticated; its signature is never checked | accounts | graphql | CWE-347 | A02 · API2 | 6 |
| AUTH-003 | No throttling or lockout on sign-in; one request tries many passwords through aliased mutations | accounts | graphql | CWE-307 | A07 · API2 | 6 |
| AUTH-004 | A session outlives sign-out: the refresh token stays valid | accounts | graphql | CWE-613 | A07 · API2 | 6 |
| AUTH-005 | Sign-in and password-reset responses reveal whether an account exists | accounts | rest | CWE-204 | A07 · API2 | 6 |

### `ACCESS` — authorization

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| ACCESS-001 | Any signed-in user reads another user's wallet and ledger by changing `userId` | accounts | graphql | CWE-639 | A01 · API1 | 5 |
| ACCESS-002 | Order lookup and cancel by `id`, without an ownership check | trading | graphql | CWE-639 | A01 · API1 | 7 |
| ACCESS-003 | Administration operations reachable by regular users: crediting a wallet and creating a user without the role check | accounts | graphql | CWE-862 | A01 · API5 | 5 |
| ACCESS-004 | A profile update writes the `role` the caller supplies | accounts | graphql | CWE-915 | A01 · API3 | 6 |
| ACCESS-005 | An internal endpoint trusts `x-user-id` and `x-user-role` headers instead of a verified token | accounts | internal | CWE-807 | A01 · API10 | 6 |
| ACCESS-006 | Entity field resolvers skip the ownership check: `User.email` and `User.wallets` are resolved for any referenced user | accounts | graphql | CWE-285 | A01 · API3 | 8 |

### `SQL` — SQL injection

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| SQL-001 | An order lookup assembled by string interpolation in `DataSource.query()` | trading | graphql | CWE-89 | A03 · API3 | 7 |
| SQL-002 | A query builder `where` built by string concatenation | trading | rest | CWE-89 | A03 · API3 | 7 |
| SQL-003 | A `LIKE` pattern concatenated from the search text | trading | graphql | CWE-89 | A03 · API3 | 7 |
| SQL-004 | A caller-controlled sort column passed to `orderBy` | trading | rest | CWE-89 | A03 · API3 | 7 |

### `MONGO` — NoSQL operator injection

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| MONGO-001 | Sign-in operator injection: the request body is the query filter | accounts | rest | CWE-943 | A03 · API3 | 5 |
| MONGO-002 | A JSON-typed `filter` argument forwarded to `find` | accounts | graphql | CWE-943 | A03 · API3 | 6 |
| MONGO-003 | Nested query-string syntax (`filter[role]=admin`) forwarded to `findOne` | accounts | rest | CWE-943 | A03 · API3 | 6 |
| MONGO-004 | User text interpolated into a `$regex` | accounts | graphql | CWE-943 | A03 · API3 | 6 |
| MONGO-005 | Caller-controlled sort and projection | accounts | graphql | CWE-943 | A03 · API3 | 6 |
| MONGO-006 | The whole request body forwarded to `$set` | accounts | graphql | CWE-915 | A03 · API3 | 6 |

### `OS` — command injection

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| OS-001 | An announcement title interpolated into a shell command | notifications | rest | CWE-78 | A03 | 8 |
| OS-002 | A caller-supplied webhook URL passed to `curl` as an argument, which allows option injection | notifications | internal | CWE-88 | A03 | 8 |

### `DESER` — deserialization, code and template injection

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| DESER-001 | A "remember me" cookie deserialized with `node-serialize` | accounts | rest | CWE-502 | A08 | 6 |
| DESER-002 | A user-written alert expression evaluated with `eval` | notifications | graphql | CWE-95 | A03 | 8 |
| DESER-003 | An announcement body compiled as a template | notifications | rest | CWE-1336 | A03 | 8 |

### `FS` — files

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| FS-001 | Path traversal in the report file download | trading | rest | CWE-22 | A01 | 7 |
| FS-002 | Path traversal through an uploaded document's file name | accounts | rest | CWE-22 | A01 | 8 |
| FS-003 | Document upload accepts any type and extension and stores under a served directory | accounts | rest | CWE-434 | A04 | 8 |

### `SSRF` — server-side request forgery

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| SSRF-001 | Webhook delivery to a caller-supplied URL reaches the internal services | notifications | graphql | CWE-918 | A10 · API7 | 8 |
| SSRF-002 | The avatar fetch follows redirects and resolves internal addresses | accounts | rest | CWE-918 | A10 · API7 | 8 |
| SSRF-003 | "Import alerts from URL" returns the fetched body | notifications | graphql | CWE-918 | A10 · API7 | 8 |

### `REDIR` — open redirect

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| REDIR-001 | Open redirect through the `next` parameter after cookie sign-in | gateway | rest | CWE-601 | A01 | 8 |

### `COOKIE` — cookie attributes and CSRF

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| COOKIE-001 | A session cookie set without `HttpOnly` | accounts | rest | CWE-1004 | A05 | 6 |
| COOKIE-002 | A session cookie set without `SameSite` | accounts | rest | CWE-1275 | A05 | 6 |
| COOKIE-003 | Cookie-authenticated GraphQL mutations accepted without CSRF protection | gateway | graphql | CWE-352 | A05 | 8 |

### `INJECT` — content injection

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| INJECT-001 | Stored HTML injection: an announcement body served as `text/html` | notifications | rest | CWE-79 | A03 | 8 |
| INJECT-002 | Reflected XSS: a gateway HTML page echoes request input unescaped | gateway | rest | CWE-79 | A03 | 8 |
| INJECT-003 | Header injection through a caller-supplied callback URL | notifications | rest | CWE-93 | A03 | 8 |
| INJECT-004 | Spreadsheet formula injection in the CSV trade export | trading | rest | CWE-1236 | A03 | 7 |

### `LOGIC` — business logic

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| LOGIC-001 | A negative deposit amount credits the wallet | accounts | graphql | CWE-20 | A04 · API6 | 5 |
| LOGIC-002 | Withdrawal race: the balance is read and later written, not atomically | accounts | graphql | CWE-367 | A04 · API6 | 6 |
| LOGIC-003 | A market order accepts the caller's price | trading | graphql | CWE-840 | A04 · API6 | 7 |
| LOGIC-004 | Floating-point arithmetic on money | trading | graphql | CWE-682 | A04 | 7 |
| LOGIC-005 | Concurrent orders oversell the available quantity: matching is not atomic | trading | graphql | CWE-362 | A04 · API6 | 7 |

### `GQL` — GraphQL-specific

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| GQL-001 | Introspection and the GraphiQL IDE are exposed | gateway | graphql | CWE-200 | A05 · API8 | 8 |
| GQL-002 | No depth or complexity limits: a recursive query through `User.orders.user.orders…` | gateway | graphql | CWE-770 | A05 · API4 | 8 |
| GQL-003 | Batched mutations in one request enable brute force | gateway | graphql | CWE-307 | A07 · API6 | 8 |
| GQL-004 | Stack traces and internal errors returned in the error response | gateway | graphql | CWE-209 | A05 · API8 | 8 |
| GQL-005 | Sensitive fields exposed in schema types: the password hash | accounts | graphql | CWE-200 | A01 · API3 | 8 |
| GQL-006 | Reference injection: an operation builds an entity reference from a caller-supplied `userId`, so the graph resolves a user the caller had no right to name | trading | graphql | CWE-639 | A01 · API1 | 8 |
| GQL-007 | Backend services answer the federation queries `_entities` and `_service` to any caller, without a credential proving it is the gateway. A direct call to a service port reads any user by key | all services | internal | CWE-306 | A05 · API9 | 8 |

### `CONFIG` — security misconfiguration

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| CONFIG-001 | CORS reflects any origin with credentials | gateway | rest | CWE-942 | A05 · API8 | 8 |
| CONFIG-002 | No security headers: helmet is not registered | gateway | rest | CWE-693 | A05 · API8 | 8 |
| CONFIG-003 | The OpenAPI document is served without authentication | gateway | rest | CWE-200 | A05 · API9 | 8 |
| CONFIG-004 | A debug endpoint returns environment values and dependency versions | gateway | rest | CWE-215 | A05 · API8 | 8 |

### `CRYPTO` — cryptographic failures

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| CRYPTO-001 | Passwords hashed with unsalted SHA-1 | accounts | internal | CWE-916 | A02 | 6 |
| CRYPTO-002 | Verification codes generated with `Math.random()` | accounts | graphql | CWE-338 | A02 | 6 |
| CRYPTO-003 | A hard-coded JWT secret, used when the environment variable is unset | accounts | internal | CWE-798 | A02 | 6 |

### `RE` — regular expression denial of service

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| RE-001 | Catastrophic backtracking in the display-name validation pattern | accounts | graphql | CWE-1333 | A03 | 6 |

### `RES` — unrestricted resource consumption

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| RES-001 | The ledger query accepts any `limit` | accounts | graphql | CWE-770 | A05 · API4 | 6 |
| RES-002 | The trade history accepts any `limit` | trading | graphql | CWE-770 | A05 · API4 | 7 |

### `INFO` — information exposure

| ID | Scenario | Service | Surface | CWE | OWASP | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| INFO-001 | Passwords and tokens written to the log | accounts | internal | CWE-532 | A09 · API8 | 6 |
| INFO-002 | Unhandled exceptions returned to the client with a stack trace | gateway | rest | CWE-209 | A05 · API8 | 8 |

### `SCA` — vulnerable dependencies

Each pin lives in one workspace. A scanner has to say which one. The advisories are verified and listed in [`docs/vulnerabilities/dependencies.md`](../../docs/vulnerabilities/dependencies.md).

| ID | Vulnerable version | Workspace | Control: the same library, patched |
| --- | --- | --- | --- |
| SCA-001 | `jsonwebtoken` 8.5.1 | `apps/accounts` | `jsonwebtoken` 9.0.3 through `@nestjs/jwt` in every other workspace |
| SCA-002 | `lodash` 4.17.20 | `apps/accounts` | `lodash` 4.18.1 in `apps/trading` |
| SCA-003 | `node-fetch` 2.6.6 | `apps/notifications` | `node-fetch` 2.7.0 in `apps/accounts` |
| SCA-004 | `ejs` 3.1.6 | `apps/notifications` | none: only one service renders templates |
| SCA-005 | `mysql2` 3.9.3 | `apps/trading` | none: only one service uses MySQL |
| SCA-006 | `dot-prop` 4.1.0 | `apps/notifications` | `dot-prop` 4.2.1 in `apps/accounts` |
| SCA-007 | `node-serialize` 0.0.4 | `apps/accounts` | none: no corrected version exists |
| SCA-008 | `@nestjs/platform-fastify` 12.0.1, which pins `fastify` 5.12.1 | `apps/trading` | 12.6.3, with `fastify` 5.12.8, in `apps/gateway` and `apps/accounts` |

`notifications` runs on the Express adapter, which pins Express 5.3.0. That version has no advisory, so Express is not a dependency target.

## Negative controls

Sources a scanner should **not** report for the listed weakness. They are ordinary files of the functional baseline, registered in the catalogue with `status: "demonstration"` and `expectedFinding: false`.

| ID | Source | Service | Listed CWE | Phase |
| --- | --- | --- | --- | --- |
| DEMO-001 | Parameterized raw SQL: `DataSource.query(sql, params)` | trading | CWE-89 | 7 |
| DEMO-002 | `execFile` with a fixed argument vector and no shell | notifications | CWE-78 | 8 |
| DEMO-003 | A sort column from an allowlist, interpolated into SQL | trading | CWE-89 | 7 |
| DEMO-004 | `JSON.parse` of a request body, with no gadget | accounts | CWE-502 | 6 |
| DEMO-005 | An HTTP/2 cleartext listener bound to loopback | accounts, trading | CWE-319 | 8 |

## Stretch scenarios

Cut first if a phase is too large (risk R8 in the [project plan](project-plan.md#9-risks-and-mitigations)). Their IDs are reserved.

| ID | Scenario | Family | Phase if taken |
| --- | --- | --- | --- |
| SQL-005 | Stacked statements through a raw query with multiple statements enabled | SQL | 7 |
| CONFIG-005 | Every proxy hop is trusted, so rate limits and logs key on a spoofable `X-Forwarded-For` | CONFIG | 8 |
| RES-003 | File upload without size or part limits | RES | 8 |
| INFO-004 | Log injection through user-controlled fields | INFO | 6 |
| SCA-009 | `qs` 6.5.3 | SCA | 9 |
| SCA-010 | `xlsx` 0.18.5, with no corrected version on npm | SCA | 9 |
| SCA-011 | `crypto-js` 4.0.0 | SCA | 9 |

## What GraphQL changes about injection

GraphQL's type system refuses an object where a scalar is declared, so the classic `{"$ne": null}` payload cannot travel through a `String!` argument. A NoSQL or SQL injection in this lab therefore arrives by one of four doors, and the catalogue places scenarios at each:

| Door | Example | Scenarios |
| --- | --- | --- |
| A REST endpoint proxied to a service | `POST /api/v1/auth/sign-in` with a JSON body | MONGO-001 |
| A JSON-typed scalar argument | `users(filter: JSON)` | MONGO-002 |
| A nested query-string parser | `?filter[role]=admin` | MONGO-003 |
| String concatenation into SQL inside the resolver | `order(id: "1 OR 1=1")` | SQL-001 to 004 |

## Catalogue file schema

`catalog/catalog.json` is an array. One entry per scenario:

```json
{
  "id": "SQL-003",
  "title": "LIKE pattern built from search text",
  "status": "active",
  "scanner": "SAST",
  "cwe": "CWE-89",
  "owasp": { "top10": "A03", "api": "API3" },
  "service": "trading",
  "workspace": "apps/trading",
  "surface": "graphql",
  "operation": "markets(search: String)",
  "source": "apps/trading/src/markets/markets.resolver.ts",
  "flow": "args.search → MarketService.search → queryBuilder.andWhere(`name LIKE '%${search}%'`)",
  "safeControl": "apps/trading/src/reports/trade-search.service.ts",
  "safeControls": [],
  "documentation": "docs/vulnerabilities/sql.md",
  "test": "tests/e2e/trading.e2e-spec.ts; tests/integration/trading.int-spec.ts",
  "phase": 7,
  "expectedFinding": true
}
```

Phase 5 finalizes the schema and adds its validator. Generated from it: `tests/expected-hashes.json` and `tests/expected-scanner-findings.json`. `tests/expected-audit.json` is generated from `pnpm audit --prod`.
