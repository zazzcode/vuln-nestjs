# Requirements

Numbered so that specifications can cite them and tests can name them. The last column is the step that delivers the requirement, as numbered in the [implementation plan](implementation-plan.md). "User" and "administrator" are the actors in [project.md](project.md).

## Functional requirements

### Accounts and identity — `accounts`

| ID | Requirement | Step |
| --- | --- | --- |
| FR-1.1 | The administrator creates a user account with an email address, a display name and a password | 2 |
| FR-1.2 | A user signs in with email and password, through the GraphQL mutation `signIn` and through `POST /api/v1/auth/sign-in`, which also sets a session cookie | 2 |
| FR-1.3 | A user signs out, and the session is revoked | 2 |
| FR-1.4 | A user reads and updates a limited set of own profile fields, and own preferences | 2 |
| FR-1.5 | The administrator reads any user and lists users | 2 |
| FR-1.6 | A user uploads a document and downloads own documents | 2 |

### Money — `trading`

| ID | Requirement | Step |
| --- | --- | --- |
| FR-2.1 | Every user has a wallet: a dollar balance and a balance for each of the five coins | 2 |
| FR-2.2 | The administrator credits a user's dollar wallet with an amount greater than zero | 2 |
| FR-2.3 | A user reads own balances and own ledger | 2 |
| FR-2.4 | A user withdraws dollars from own wallet, within the available balance | 2 |
| FR-2.5 | Every balance change writes a ledger entry with its kind, asset, amount and reference | 2 |

### Markets — `trading`

| ID | Requirement | Step |
| --- | --- | --- |
| FR-3.1 | Five markets exist: BTC, ETH, SOL, XRP and DOGE against USD | 2 |
| FR-3.2 | Each market has a reference price that moves on a price tick | 2 |
| FR-3.3 | The administrator triggers a price tick. The same number of ticks always gives the same prices | 2 |

### Trading — `trading`

| ID | Requirement | Step |
| --- | --- | --- |
| FR-4.1 | A signed-in user places a market order, which fills immediately at the reference price | 2 |
| FR-4.2 | A signed-in user places a limit order. Its funds are taken at once. It is filled by a tick that crosses its price. Cancelling it refunds the funds | 2 |
| FR-4.3 | A user cancels an own open order | 2 |
| FR-4.4 | Any caller reads the order book and the recent trades of a market | 2 |
| FR-4.5 | A user reads own orders and trades, through `User.orders` and `User.trades` in the federated graph | 2 |
| FR-4.6 | Placing an order is one transaction in one service. It needs no other service | 2 |

### Notifications — `notifications`

| ID | Requirement | Step |
| --- | --- | --- |
| FR-5.1 | A user creates, lists and deletes a price alert: a market, a direction and a threshold | 2 |
| FR-5.2 | A user sets a webhook URL and can send a test delivery to it | 2 |
| FR-5.3 | `evaluateAlerts(prices)` evaluates every enabled alert against the prices it is given, and delivers to a crossed alert's webhook. The client calls it after a price tick | 2 |
| FR-5.4 | Every delivery attempt is recorded with its status and error | 2 |
| FR-5.5 | The administrator creates and sends an announcement | 2 |

### API surface

| ID | Requirement | Step |
| --- | --- | --- |
| FR-6.1 | The gateway serves one federated GraphQL schema at `POST /graphql`, composed from the three subgraphs | 1 |
| FR-6.2 | `trading` and `notifications` add fields to the `User` entity owned by `accounts` | 2 |
| FR-6.3 | The gateway forwards REST requests under `/api/v1` to a service's `/internal/*` endpoints, for what the graph does not carry well: cookies, file upload and download, CSV, HTML pages | 1, 2 |
| FR-6.4 | The backend services listen on loopback only. Clients reach them only through the gateway | 1 |
| FR-6.5 | The gateway serves an OpenAPI document for its REST endpoints | 1 |
| FR-6.6 | **No service calls another service.** The gateway talks to every service | 1 |
| FR-6.7 | The gateway, `accounts` and `trading` use the Fastify adapter. `notifications` uses the Express adapter | 1 |

### Lab operations

| ID | Requirement | Step |
| --- | --- | --- |
| FR-7.1 | One command starts all four services in dependency order and stops them, including the database processes | 1 |
| FR-7.2 | `POST /api/v1/lab/reset` returns every store to its fake data | 1 |
| FR-7.3 | `GET /api/v1/health` reports each service and each store | 1 |
| FR-7.4 | Ports and secrets come from environment variables, with defaults that are safe on loopback. The start command generates the secrets for a run | 1 |
| FR-7.5 | Fake data: the administrator, five users with starting balances, five markets with reference prices, and enough orders, trades and alerts for every query to return something. The fake users have fixed identifiers shared by every service | 2 |
| FR-7.6 | After the stop, no database process and no temporary data directory remain | 1 |

### Lab content

| ID | Requirement | Step |
| --- | --- | --- |
| FR-8.1 | Every deliberate weakness is a scenario with an ID in the catalogue | 2 |
| FR-8.2 | Every vulnerable operation has a protected counterpart that receives the identical payload and stays inert; a second one wherever a second technique exists | 2 |
| FR-8.3 | About two safe operations for every vulnerable one. At least one | 2 |
| FR-8.4 | Every category of the OWASP Top 10 and of the OWASP API Security Top 10 is covered. SQL injection, NoSQL injection, prototype pollution and stored cross-site scripting are covered explicitly | 2 |
| FR-8.5 | Vulnerable versions of libraries are pinned, one workspace per pin, with patched versions in other workspaces as controls | 4 |
| FR-8.6 | Every scenario has documentation: the flaw explained, reproduction with curl, Postman and Burp, the counterparts compared, and the tests | 2 |
| FR-8.7 | Ground truth is generated from the catalogue: source hashes, scanner expectations and the audit snapshot | 1, 4 |

### Tests and automation

| ID | Requirement | Step |
| --- | --- | --- |
| FR-9.1 | Vitest unit tests sit beside the code as `*.spec.ts` | 1 |
| FR-9.2 | **Each service has API tests that start that service alone**, with its own store, and call every operation of its specification, each scenario in both directions | 2 |
| FR-9.3 | Vitest end-to-end tests run through the gateway with all four services up | 1, 3 |
| FR-9.4 | A Postman collection and environment cover the functional flows and one request per scenario, and run under Newman | 1, 3 |
| FR-9.5 | CI runs lint, unit tests, service API tests, build, end-to-end tests, Newman and the ground-truth checks on every pull request | 1 |

## Non-functional requirements

| ID | Requirement | Checked by |
| --- | --- | --- |
| NFR-1 | Every listener binds `127.0.0.1`. Nothing listens on another interface | An end-to-end test and a startup assertion |
| NFR-2 | All data is synthetic. Exploit proofs use harmless markers such as `42` and `zazzles-lab-marker` | Review |
| NFR-3 | At runtime the lab depends on no external service. The `mongod` and `mysqld` binaries are the only downloads, cached after the first run | A clean-clone run with the network blocked after the binaries are cached |
| NFR-4 | Given the same fake data and the same sequence of requests, every result is identical | An end-to-end test that runs the same script twice after reset |
| NFR-5 | The code is idiomatic NestJS 12: modules, providers, decorators, guards, pipes, interceptors and exception filters; ESM with `.js` import specifiers; Vitest; oxlint; Prettier | Lint, review |
| NFR-6 | Every dependency is pinned to an exact version, and the lockfile is committed | A test over the manifests |
| NFR-7 | After the binaries are cached, the stack is up in under 60 seconds; the full CI run takes under 10 minutes | Measured in CI |
| NFR-8 | In the functional baseline, bad input never crashes a service. Logs go through the NestJS logger and contain no passwords or tokens | Tests, review |
| NFR-9 | The lab sends no telemetry and calls no third-party service on its own | Review of the dependency list; no Observe |
| NFR-10 | Documentation stays in sync with the code where a test can enforce it: catalogue entries point at files that exist, and registered files match their hashes | `pnpm scenario:check` |
| NFR-11 | The application is a sample. It is started, preloaded with fake data, exercised, and stopped. Code that matters only for an application that stays up does not belong in it | Review |
| NFR-12 | The code stays small. Infrastructure plumbing is kept out so that a scanner finding points at the pattern under test | Review |
| NFR-13 | A service never imports the HTTP client of another service | A lint rule |

## Out of scope

- A user interface
- Persistence across restarts, and anything that exists to keep an application running: deployment, scaling, monitoring
- Calls between services
- Matching orders against each other, partial fills, streaming prices, withdrawals to external addresses
- Real identity providers, email delivery, or a real payment rail
