# Scenario catalogue

**Status:** revised on 2026-11-26 after review by the Project Owner. Every scenario is designed; none is built.

The design of each scenario — the vulnerable operation, its sink, and its protected counterparts — is in the [service specifications](services/README.md). This page is the index: every ID, what it is, where it lives, and which OWASP categories it covers.

IDs are final in the design. They become permanent when a scenario ships and gets its entry in `catalog/catalog.json`.

## Conventions

- **ID:** `<FAMILY>-<number>`. One scenario can share an operation with another, when one operation carries two weaknesses.
- **A scenario is an operation**: a GraphQL field, a REST endpoint, or a process-wide setting.
- **Vulnerable and protected are separate operations.** A protected counterpart receives the identical payload and stays inert. Where a second technique exists, there is a second counterpart.
- **About two safe operations for every vulnerable one.** 121 safe, 65 vulnerable.
- **Scanner:** `SAST` for weaknesses in application code, `SCA` for vulnerable dependency versions.
- **Names in code are neutral.** The specifications and this catalogue hold the answer. The vulnerable line carries a marker.
- **OWASP column:** OWASP Top 10 (2021) and OWASP API Security Top 10 (2023), as `A03 · API3`.

## Families

| Family | Covers | OWASP Top 10 | OWASP API | Scenarios | Services |
| --- | --- | --- | --- | --- | --- |
| `AUTH` | Authentication and sessions | A02, A07 | API2 | 5 | accounts |
| `CRYPTO` | Weak hashing, weak randomness, hard-coded secrets | A02 | — | 3 | accounts |
| `ACCESS` | Authorization: object, function and property level; trusted headers | A01 | API1, API3, API5, API10 | 10 | accounts, trading, notifications |
| `SQL` | SQL injection: template literals taken for prepared statements, through TypeORM and MySQL | A03 | API3 | 7 | trading |
| `MONGO` | NoSQL operator injection | A03 | API3 | 6 | accounts |
| `PROTO` | Prototype pollution | A08 | — | 3 | accounts, notifications |
| `XSS` | Stored and reflected cross-site scripting | A03 | — | 4 | accounts, notifications, gateway |
| `FS` | Path traversal, unrestricted upload | A01, A04 | — | 4 | accounts, trading |
| `SSRF` | Server-side request forgery | A10 | API7 | 3 | accounts, notifications |
| `OS` | Command and argument injection | A03 | — | 2 | notifications |
| `DESER` | Unsafe deserialization, `eval`, template injection | A08, A03 | — | 3 | accounts, notifications |
| `LOGIC` | Business logic: negative amounts, races, precision | A04 | API6 | 5 | trading |
| `GQL` | GraphQL itself | A05, A01, A07 | API1, API3, API4, API6, API8, API9 | 7 | gateway, accounts, trading |
| `CONFIG` | Security misconfiguration | A05 | API8, API9 | 4 | gateway |
| `COOKIE` | Cookie attributes and CSRF | A05 | — | 3 | accounts, gateway |
| `REDIR` | Open redirect | A01 | — | 1 | gateway |
| `INJECT` | Spreadsheet-formula and log injection | A03 | — | 2 | trading, notifications |
| `RE` | Regular expression denial of service | A03 | — | 1 | accounts |
| `RES` | Unrestricted resource consumption | A05 | API4 | 2 | accounts, trading |
| `INFO` | Information exposure through logs and errors | A09, A05 | API8 | 2 | accounts, gateway |
| `SCA` | Vulnerable dependency versions | A06 | — | 8 | one workspace each |

**77 application scenarios and 8 dependency pins.** Every category of both OWASP lists is covered.

## `AUTH` — accounts

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
| AUTH-001 | JWT verified without pinning the algorithm | `whoAmI` | A02 · API2 |
| AUTH-002 | Token decoded with `jwt.decode` and trusted | `GET /api/v1/auth/whoami` | A02 · API2 |
| AUTH-003 | No lockout or rate limit on sign-in | `quickSignIn` | A07 · API2 |
| AUTH-004 | Sign-out revokes nothing | `signOutLegacy` | A07 · API2 |
| AUTH-005 | The response reveals whether an account exists | `checkAccount` | A07 · API2 |

## `CRYPTO` — accounts

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
| CRYPTO-001 | Unsalted SHA-1 password hash | `signUp` | A02 |
| CRYPTO-002 | Reset code from `Math.random()` | `recoverPassword` | A02 |
| CRYPTO-003 | Hard-coded JWT secret with an environment fallback | `whoAmI` | A02 |

## `ACCESS`

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| ACCESS-001 | Another user's email and preferences by `userId` | accounts | `userPreferences` | A01 · API1 |
| ACCESS-002 | Order details without an ownership check | trading | `orderDetails` | A01 · API1 |
| ACCESS-003 | A user creates accounts | accounts | `createUserAccount` | A01 · API5 |
| ACCESS-004 | Mass assignment through a profile DTO | accounts | `PATCH /api/v1/profile` | A01 · API3 |
| ACCESS-005 | An internal endpoint trusts `x-user-id` | accounts | `GET /internal/me` | A01 · API10 |
| ACCESS-006 | Another user's alerts and webhook URL | notifications | `alertsOf` | A01 · API1 |
| ACCESS-007 | A user sets a reference price | trading | `setReferencePrice` | A01 · API5 |
| ACCESS-008 | Another user's wallet and ledger | trading | `walletOf` | A01 · API1 |
| ACCESS-009 | A user credits any wallet | trading | `creditWallet` | A01 · API5 |
| ACCESS-010 | Mass assignment through an order DTO | trading | `PATCH /api/v1/orders/:id` | A01 · API3 |

## `SQL` — trading

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
The same mistake in seven pieces of code: a template literal taken for a prepared statement. The [trading specification](services/trading.md#sql--sql-injection) says what each author believed.

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
| SQL-001 | An untagged template literal, written as if the backticks bound the value | `orderLookup` | A03 · API3 |
| SQL-002 | Query builder `where` built by concatenation | `tradeHistory` | A03 · API3 |
| SQL-003 | `LIKE` pattern concatenated | `searchMarkets` | A03 · API3 |
| SQL-004 | Caller-controlled sort column | `tradesSorted` | A03 · API3 |
| SQL-005 | A tag that escapes quotes and joins, taken for one that parameterizes | `volumeFor` | A03 · API3 |
| SQL-006 | `execute()` on a string built with a template literal: no placeholder, no parameter | `feesPaid` | A03 · API3 |
| SQL-007 | An `IN (…)` list joined from the caller's ids | `ordersByIds` | A03 · API3 |

## `MONGO` — accounts

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
| MONGO-001 | Sign-in operator injection: the body is the filter | `POST /api/v1/auth/login` | A03 · API3 |
| MONGO-002 | A `JSON` filter forwarded to `find` | `findUsers` | A03 · API3 |
| MONGO-003 | Nested query string used as the filter | `GET /api/v1/users/filter` | A03 · API3 |
| MONGO-004 | User text interpolated into `$regex` | `findUsersByName` | A03 · API3 |
| MONGO-005 | Caller-controlled sort and projection | `findUsers` | A03 · API3 |
| MONGO-006 | The request body is the `$set` document | `updatePreferencesAll` | A03 · API3 |

## `PROTO` — prototype pollution

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| PROTO-001 | A dotted path walked without checks | accounts | `setPreferenceByPath` | A08 |
| PROTO-002 | A parsed string deep-merged | accounts | `updateNotificationSettings` | A08 |
| PROTO-003 | `dot-prop` `set` with the caller's path | notifications | `setChannelByPath` | A08 · A06 |

## `XSS` — cross-site scripting

| ID | Scenario | Service | Kind | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- | --- |
| XSS-001 | Script in an announcement page | notifications | stored | `GET /api/v1/announcements/:id.html` | A03 |
| XSS-002 | An uploaded file served inline | accounts | stored | `GET …/documents/file/:name/view` | A03 |
| XSS-003 | A name parameter echoed into a status page | gateway | reflected | `GET /api/v1/public/status` | A03 |
| XSS-004 | Display names rendered into HTML | accounts | stored | `GET /api/v1/admin/users.html` | A03 |

## `FS` — files

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| FS-001 | Path traversal in a document download | accounts | `GET …/documents/file/:name` | A01 |
| FS-002 | An upload stored under its own name | accounts | `POST …/documents/legacy` | A01 |
| FS-003 | Any file type accepted | accounts | `POST …/documents/legacy` | A04 |
| FS-004 | Path traversal in a report download | trading | `GET /api/v1/reports/files/:name` | A01 |

## `SSRF`, `OS`, `DESER`

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| SSRF-001 | A webhook posted to any URL | notifications | `testWebhook` | A10 · API7 |
| SSRF-002 | An avatar URL fetched wherever it points | accounts | `POST /api/v1/profile/avatar` | A10 · API7 |
| SSRF-003 | A URL fetched and its body returned | notifications | `POST /api/v1/alerts/fetch` | A10 · API7 |
| OS-001 | A title interpolated into a shell command | notifications | `POST /api/v1/admin/announcements/send` | A03 |
| OS-002 | A caller URL passed to `curl` as an argument | notifications | `pingWebhook` | A03 |
| DESER-001 | A cookie passed to `node-serialize` | accounts | `POST /api/v1/auth/refresh` | A08 |
| DESER-002 | A user expression run with `eval` | notifications | `createSmartAlert` | A03 |
| DESER-003 | An announcement body compiled as a template | notifications | `POST /api/v1/admin/announcements/send` | A03 |

## `LOGIC` — trading

| ID | Scenario | Vulnerable operation | OWASP |
| --- | --- | --- | --- |
| LOGIC-001 | A negative amount credits a wallet | `payout` | A04 · API6 |
| LOGIC-002 | Withdrawal race: read, then write | `payout` | A04 · API6 |
| LOGIC-003 | A market order takes the caller's price | `quickBuy` | A04 · API6 |
| LOGIC-004 | Floating-point arithmetic on money | `convert` | A04 |
| LOGIC-005 | An order filled twice by concurrent calls | `matchOrder` | A04 · API6 |

## `GQL` — GraphQL itself

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| GQL-001 | Introspection and GraphiQL served to anyone | gateway | setting | A05 · API8 |
| GQL-002 | No depth or complexity limit | gateway | setting | A05 · API4 |
| GQL-003 | Batched requests | gateway | setting | A07 · API6 |
| GQL-004 | A stack trace in every error | gateway | setting | A05 · API8 |
| GQL-005 | The password hash is a field of a GraphQL type | accounts | `whoAmI` | A01 · API3 |
| GQL-006 | An entity reference built from the caller's input | trading | `giftOrder` | A01 · API1 |
| GQL-007 | Backend services answer `_entities` and `_service` to any caller | all services | setting | A05 · API9 |

## `CONFIG`, `COOKIE`, `REDIR`, `INJECT`, `RE`, `RES`, `INFO`

| ID | Scenario | Service | Vulnerable operation | OWASP |
| --- | --- | --- | --- | --- |
| CONFIG-001 | CORS reflects any origin, with credentials | gateway | `GET /api/v1/public/ticker` | A05 · API8 |
| CONFIG-002 | No security headers | gateway | `GET /api/v1/public/status` | A05 · API8 |
| CONFIG-003 | The OpenAPI document served with no authentication | gateway | `GET /docs` | A05 · API9 |
| CONFIG-004 | A debug endpoint returns the environment and versions | gateway | `GET /api/v1/debug` | A05 · API8 |
| COOKIE-001 | A cookie without `HttpOnly` | accounts | `POST /api/v1/auth/token` | A05 |
| COOKIE-002 | A long-lived cookie without `SameSite` | accounts | `POST /api/v1/auth/remember` | A05 |
| COOKIE-003 | A cookie-authenticated state change with no CSRF token | gateway | `POST /api/v1/profile/preferences` | A05 |
| REDIR-001 | Open redirect after sign-in | gateway | `GET /api/v1/auth/redirect` | A01 |
| INJECT-001 | Spreadsheet formula in a CSV export | trading | `GET /api/v1/reports/trades-raw.csv` | A03 |
| INJECT-002 | A label forged into a log line | notifications | `createLabeledAlert` | A03 |
| RE-001 | A pattern with nested quantifiers | accounts | `updateDisplayName` | A03 |
| RES-001 | No cap on `limit` | accounts | `usersAll` | A05 · API4 |
| RES-002 | No cap on `limit` | trading | `allTrades` | A05 · API4 |
| INFO-001 | The password and token written to the log | accounts | `POST /api/v1/auth/token` | A09 · API8 |
| INFO-002 | An error's stack returned to the client | gateway | `GET /api/v1/public/diagnostics` | A05 · API8 |

## `SCA` — vulnerable dependencies

Eight pins, one workspace each. The advisories, checked against the GitHub Advisory Database on 2026-11-26, are in [`docs/vulnerabilities/dependencies.md`](../../docs/vulnerabilities/dependencies.md).

| ID | Version | Workspace | OWASP |
| --- | --- | --- | --- |
| SCA-001 | `jsonwebtoken` 8.5.1 | `apps/accounts` | A06 |
| SCA-002 | `lodash` 4.17.20 | `apps/accounts` | A06 |
| SCA-003 | `node-fetch` 2.6.6 | `apps/notifications` | A06 |
| SCA-004 | `ejs` 3.1.6 | `apps/notifications` | A06 |
| SCA-005 | `mysql2` 3.9.3 | `apps/trading` | A06 |
| SCA-006 | `dot-prop` 4.1.0 | `apps/notifications` | A06 |
| SCA-007 | `node-serialize` 0.0.4 | `apps/accounts` | A06 |
| SCA-008 | `@nestjs/platform-fastify` 12.0.1, with `fastify` 5.12.1 | `apps/trading` | A06 |

## What the ratio is, and where it falls short

| Service | Vulnerable operations | Safe operations | Safe per vulnerable |
| --- | --- | --- | --- |
| accounts | 28 | 41 | 1.5 |
| trading | 20 | 38 | 1.9 |
| notifications | 9 | 29 | 3.2 |
| gateway | 8 | 13 | 1.6 |
| **All** | **65** | **121** | **1.9** |

The Project Owner asked for about two safe for every vulnerable one, or one to one if two is harder. The lab reaches 1.9. The gateway is where it falls short, because five of its weaknesses are settings a process cannot have twice.

## Catalogue file schema

`catalog/catalog.json` is an array with one entry per scenario. The scaffolding adds the file and its validator.

```json
{
  "id": "SQL-003",
  "title": "LIKE pattern built from search text",
  "status": "active",
  "scanner": "SAST",
  "cwe": "CWE-89",
  "owasp": { "top10": "A03", "api": "API3" },
  "service": "trading",
  "surface": "graphql",
  "operation": "searchMarkets(q: String!)",
  "source": "apps/trading/src/markets/search-markets.resolver.ts",
  "flow": "args.q → MarketService.search → queryBuilder.andWhere(`name LIKE '%${q}%'`)",
  "safeControl": "apps/trading/src/markets/markets.resolver.ts",
  "safeControls": ["apps/trading/src/markets/markets-by-assets.resolver.ts"],
  "documentation": "docs/vulnerabilities/sql.md",
  "test": "apps/trading/test/scenarios/sql.int-spec.ts",
  "expectedFinding": true
}
```

Generated from it: `tests/expected-hashes.json` and `tests/expected-scanner-findings.json`. `tests/expected-audit.json` is generated from `pnpm audit --prod`.
