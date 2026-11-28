# Vulnerabilities

**Status: built.** Every scenario the [service specifications](../../.zazz/project/services/README.md) designed is in the code, and this page is the table of all 77, each with a link to its write-up. The eight vulnerable dependency pins carry no ID of their own in the catalogue; they are in [dependencies.md](dependencies.md).

## What a scenario is

One deliberate weakness. Each has:

| Part | What it is |
| --- | --- |
| An ID | `<FAMILY>-<number>`, such as `SQL-003`. Permanent |
| A vulnerable operation | A GraphQL field, a REST endpoint, or a process-wide setting |
| A protected counterpart | An operation that receives the identical payload and keeps it inert. Where a second technique exists, a second counterpart. A setting has none: the application cannot run both values at once, so its entry records the hardened value |
| Documentation | A module per family under `docs/vulnerabilities/`, the Families table links each, with the five sections below |
| Tests | One proving the exploit, one proving each counterpart is inert, and one request in the Postman collection |
| A catalogue entry | `catalog/catalog.json` is the source of truth from which the ground truth is generated |

## Families

| Family | Covers | Scenarios | OWASP Top 10 | OWASP API | Module |
| --- | --- | --- | --- | --- | --- |
| `AUTH` | Authentication and sessions | 5 | A02, A07 | API2 | [auth.md](auth.md) |
| `CRYPTO` | Weak hashing, weak randomness, hard-coded secrets | 3 | A02 | — | [crypto.md](crypto.md) |
| `ACCESS` | Authorization: object, function and property level; trusted headers | 10 | A01 | API1, API3, API5 | [access.md](access.md) |
| `SQL` | SQL injection: template literals taken for prepared statements | 7 | A03 | API3 | [sql.md](sql.md) |
| `MONGO` | NoSQL operator injection | 6 | A03 | API3 | [mongo.md](mongo.md) |
| `PROTO` | Prototype pollution | 3 | A08 | — | [proto.md](proto.md) |
| `XSS` | Stored and reflected cross-site scripting | 4 | A03 | — | [xss.md](xss.md) |
| `FS` | Path traversal, unrestricted upload | 4 | A01, A04 | — | [fs.md](fs.md) |
| `SSRF` | Server-side request forgery | 3 | A10 | API7 | [ssrf.md](ssrf.md) |
| `OS` | Command and argument injection | 2 | A03 | — | [os.md](os.md) |
| `DESER` | Unsafe deserialization, `eval`, template injection | 3 | A03, A08 | — | [deser.md](deser.md) |
| `LOGIC` | Business logic: negative amounts, races, precision | 5 | A04 | API6 | [logic.md](logic.md) |
| `GQL` | GraphQL itself | 7 | A01, A05, A07 | API1, API3, API4, API6, API8, API9 | [gql.md](gql.md) |
| `CONFIG` | Security misconfiguration | 4 | A05 | API8, API9 | [config.md](config.md) |
| `COOKIE` | Cookie attributes and CSRF | 3 | A05 | — | [cookie.md](cookie.md) |
| `REDIR` | Open redirect | 1 | A01 | — | [redir.md](redir.md) |
| `INJECT` | Spreadsheet-formula and log injection | 2 | A03, A09 | — | [inject.md](inject.md) |
| `RE` | Regular expression denial of service | 1 | A03 | — | [re.md](re.md) |
| `RES` | Unrestricted resource consumption | 2 | A05 | API4 | [res.md](res.md) |
| `INFO` | Information exposure through logs and errors | 2 | A05, A09 | API8 | [info.md](info.md) |
| `SCA` | Vulnerable dependency versions | 8 pins | A06 | — | [dependencies.md](dependencies.md) |

**77 scenarios in application code, and 8 vulnerable dependency pins.** By service: 33 in `accounts`, 21 in `trading`, 10 in `notifications` and 13 in the `gateway`. By the catalogue's own mapping, all ten categories of the OWASP Top 10 are covered, A06 through the pins, and nine of the OWASP API Security Top 10, API1 to API9; so are the four the Project Owner named: SQL injection, NoSQL injection, prototype pollution and stored XSS.

## Safe and vulnerable

Every vulnerable operation has its protected counterpart, and the lab keeps about one and a half safe operations for every vulnerable one ([ADR-013](../../.zazz/architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md)). That ratio counts operations, and the catalogue registers counterpart files, not operations, so the count of safe operations is each service's to report and is not made here. What the catalogue verifies:

| Service | Scenarios | With a counterpart registered | Counterpart files registered |
| --- | --- | --- | --- |
| `accounts` | 33 | 33 | 8 |
| `trading` | 21 | 21 | 22 |
| `notifications` | 10 | 10 | 17 |
| `gateway` | 13 | 9 | 8 |

"Counterpart files" counts the files the catalogue names as `safeControl` or `safeControls` under each service's directory: one file can be the counterpart of several scenarios and hold several operations, and one scenario can name two counterparts that share a file. Five `gateway` scenarios are settings and record a hardened value; four of them have no counterpart, and GQL-007 has both.

The safe operations are what a scanner must leave alone. A report against one, for the weakness it is the counterpart of, is a false positive.

## How each scenario is documented

One module per family under `docs/vulnerabilities/`, with the same linkable sections for every scenario. The anchors are explicit, so an agent or a person can deep-link without reading around them.

| Section | Anchor | Holds |
| --- | --- | --- |
| Scenario | `#<id>` | The heading |
| Agent reference | `#<id>-agent` | A compact, self-contained block: source path, operation, sink, flow, counterpart paths, tests, the expected finding |
| Student guide | `#<id>-student` | The flaw explained: the mechanism, the code, why it works |
| Exploit lab | `#<id>-exploit` | Reproduction with curl, Postman and Burp, and the observation that proves exploitation |
| Vulnerable and protected | `#<id>-safe` | The operations side by side, and *why* each counterpart works |
| Tests | `#<id>-tests` | The automated coverage of both directions, and the Postman request |

Every reproduction is written only after it has been run. Every exploit uses a harmless marker and a loopback address. A counterpart's claim is scoped: this pattern defeats this flaw for identical input, never more.

## The scenarios

One row per scenario, by family. The ID links to the scenario's agent reference.

| ID | Title | Service | Vulnerable operation | Protected counterpart, or hardened value | OWASP |
| --- | --- | --- | --- | --- | --- |
| [ACCESS-001](access.md#access-001-agent) | another account by identifier, with no ownership check | `accounts` | `userPreferences(userId)` | `me`, `user(id)` | A01 · API1 |
| [ACCESS-002](access.md#access-002-agent) | `orderDetails`: no ownership check | `trading` | `orderDetails(id: ID!)` | `order(id)`, `User.orders` | A01 · API1 |
| [ACCESS-003](access.md#access-003-agent) | a user's token opens an administrator's account | `accounts` | `createUserAccount(input)` | `createUser`, `POST /internal/admin/users` | A01 · API1 |
| [ACCESS-004](access.md#access-004-agent) | the body of the legacy profile editor is the change | `accounts` | `PATCH /internal/profile` | `updateProfile`, `PUT /internal/profile` | A01 · API3 |
| [ACCESS-005](access.md#access-005-agent) | a header believed as identity | `accounts` | `GET /internal/me` | `introspect`, `GET /internal/users/lookup` | A01 |
| [ACCESS-006](access.md#access-006-agent) | another user's alerts by id | `notifications` | `alertsOf(userId: ID!)` | `alerts`, `User.alerts` | A01 |
| [ACCESS-007](access.md#access-007-agent) | `setReferencePrice`: a user moves a market | `trading` | `setReferencePrice(symbol: String!, price: Decimal!)` | `tickPrices`, `POST /internal/admin/prices/tick` | A01 · API5 |
| [ACCESS-008](access.md#access-008-agent) | `walletOf`: another user's balances by id | `trading` | `walletOf(userId: ID!)` | `wallet`, `ledger`, `wallets(userId)` | A01 · API1 |
| [ACCESS-009](access.md#access-009-agent) | `creditWallet`: a user credits a wallet | `trading` | `creditWallet(userId: ID!, amount: Decimal!)` | `deposit`, `POST /internal/admin/deposits` | A01 · API5 |
| [ACCESS-010](access.md#access-010-agent) | `PATCH /internal/orders/:id`: mass assignment | `trading` | `PATCH /internal/orders/:id` | `updateOrder`, `PUT /internal/orders/:id` | A01 · API3 |
| [AUTH-001](auth.md#auth-001-agent) | a token signed with the public key as an HMAC secret | `accounts` | `whoAmI` | `me`, `sessionInfo` | A02 · API2 |
| [AUTH-002](auth.md#auth-002-agent) | a decoded token treated as proof | `accounts` | `GET /internal/sessions/decoded` | `me`, `introspect` | A02 · API2 |
| [AUTH-003](auth.md#auth-003-agent) | no lockout on the quick alias | `accounts` | `quickSignIn` | `signIn`, `POST /internal/sessions/typed` | A07 · API2 |
| [AUTH-004](auth.md#auth-004-agent) | the legacy sign-out revokes nothing | `accounts` | `signOutLegacy` | `signOut`, `POST /internal/sessions/revoke` | A07 · API2 |
| [AUTH-005](auth.md#auth-005-agent) | the answer differs for an account that exists | `accounts` | `checkAccount` | `requestPasswordReset`, `signIn` | A07 · API2 |
| [CONFIG-001](config.md#config-001-agent) | CORS reflects any origin, with credentials | `gateway` | `GET /api/v1/public/ticker` | `GET /api/v1/markets/ticker`, `GET /api/v1/partner/ticker` | A05 · API8 |
| [CONFIG-002](config.md#config-002-agent) | no security headers on the public scope | `gateway` | `GET /api/v1/public/status` | `GET /api/v1/health`, `GET /api/v1/status` | A05 · API8 |
| [CONFIG-003](config.md#config-003-agent) | the API document served with no authentication | `gateway` | `GET /docs, GET /docs/json` | `GET /api/v1/admin/openapi.json`, `GET /api/v1/openapi.json` | A05 · API9 |
| [CONFIG-004](config.md#config-004-agent) | a debug endpoint answers the environment and the versions | `gateway` | `GET /api/v1/debug` | `GET /api/v1/health`, `GET /api/v1/admin/diagnostics` | A05 · API8 |
| [COOKIE-001](cookie.md#cookie-001-agent) | the token cookie is set without `HttpOnly` | `accounts` | `POST /internal/sessions/token` | `POST /internal/sessions/typed`, `POST /internal/sessions/signed` | A05 |
| [COOKIE-002](cookie.md#cookie-002-agent) | the remember cookie lives thirty days with no `SameSite` | `accounts` | `POST /internal/sessions/remember` | `POST /internal/sessions/typed`, `POST /internal/sessions/signed` | A05 |
| [COOKIE-003](cookie.md#cookie-003-agent) | a preference change a cross-site form can submit | `gateway` | `POST /api/v1/profile/preferences` | `POST /api/v1/profile/preferences/json`, `POST /api/v1/profile/preferences/csrf` | A05 |
| [CRYPTO-001](crypto.md#crypto-001-agent) | the sign-up of the old client stores an unsalted SHA-1 | `accounts` | `signUp` | `createUser`, `POST /internal/admin/users` | A02 |
| [CRYPTO-002](crypto.md#crypto-002-agent) | the recovery code of the old client comes from `Math.random()` | `accounts` | `recoverPassword` | `requestPasswordReset`, `resetPassword` | A02 |
| [CRYPTO-003](crypto.md#crypto-003-agent) | the committed fallback secret verifies tokens | `accounts` | `whoAmI, through LegacyTokenGuard` | `me`, `sessionInfo` | A02 |
| [DESER-001](deser.md#deser-001-agent) | the remember cookie goes to `node-serialize` | `accounts` | `POST /internal/sessions/resume-legacy` | `POST /internal/sessions/resume`, `introspect` | A08 |
| [DESER-002](deser.md#deser-002-agent) | an alert expression that is code | `notifications` | `createSmartAlert(expression: String!)` | `createAlert`, `createRuleAlert` | A03 |
| [DESER-003](deser.md#deser-003-agent) | an announcement body that is a template | `notifications` | `POST /internal/announcements/send` | `broadcastAnnouncement`, `POST /internal/announcements/notify` | A03 |
| [FS-001](fs.md#fs-001-agent) | the file name is the path | `accounts` | `GET /internal/documents/file/:name` | `GET /internal/documents/:id/view`, `GET /internal/documents/by-name/:name` | A01 |
| [FS-002](fs.md#fs-002-agent) | the upload is stored under its own name | `accounts` | `POST /internal/documents/legacy?name=` | `POST /internal/documents`, `POST /internal/documents/checked` | A04 |
| [FS-003](fs.md#fs-003-agent) | any type accepted, HTML included | `accounts` | `POST /internal/documents/legacy` | `POST /internal/documents`, `POST /internal/documents/checked` | A04 |
| [FS-004](fs.md#fs-004-agent) | path traversal in a report download | `trading` | `GET /internal/reports/files/:name` | `GET /internal/reports/:id`, `GET /internal/reports/file/:name` | A01 |
| [GQL-001](gql.md#gql-001-agent) | introspection and the GraphiQL IDE, served to anyone | `gateway` | `introspection: true, graphiql: true (POST /graphql, GET /graphql with Accept: text/html)` | Hardened value: `introspection: false`, `graphiql: false` | A05 · API8 |
| [GQL-002](gql.md#gql-002-agent) | no depth or complexity limit | `gateway` | `no validationRules (POST /graphql)` | Hardened value: a depth rule with a limit of 5 in `validationRules` | A05 · API4 |
| [GQL-003](gql.md#gql-003-agent) | batched requests: many operations in one call | `gateway` | `allowBatchedHttpRequests: true (POST /graphql)` | Hardened value: `allowBatchedHttpRequests: false` | A07 · API6 |
| [GQL-004](gql.md#gql-004-agent) | a stack trace in every error | `gateway` | `includeStacktraceInErrorResponses: true (POST /graphql)` | Hardened value: `includeStacktraceInErrorResponses: false` | A05 · API8 |
| [GQL-005](gql.md#gql-005-agent) | the password hash is a field of the record | `accounts` | `whoAmI: UserRecord` | `me`, `user(id)` | A01 · API3 |
| [GQL-006](gql.md#gql-006-agent) | an entity reference built from the caller's input | `trading` | `giftOrder(toUserId: ID!, input: PlaceOrderInput!)` | `placeOrder`, `User.orders` | A01 · API1 |
| [GQL-007](gql.md#gql-007-agent) | the federation queries of the backend services answer any caller | `gateway` | `accounts and notifications ask no credential on _entities and _service; the gateway presents x-internal-token on every subgraph fetch` | The `gateway`'s subgraph data source, which presents `x-internal-token`; the GraphQL module of `trading`. Hardened value: a subgraph requires the token on `_entities` and `_service` | A05 · API9 |
| [INFO-001](info.md#info-001-agent) | the password and the token reach the log | `accounts` | `POST /internal/sessions/token` | `signIn`, `POST /internal/sessions/typed` | A09 · API8 |
| [INFO-002](info.md#info-002-agent) | the public diagnostics page answers a failure in full | `gateway` | `GET /api/v1/public/diagnostics` | `GET /api/v1/markets/ticker`, `GET /api/v1/partner/ticker` | A05 · API8 |
| [INJECT-001](inject.md#inject-001-agent) | spreadsheet-formula injection in a CSV export | `trading` | `GET /internal/reports/trades-raw.csv` | `GET /internal/reports/trades.csv`, `GET /internal/reports/trades.json` | A03 |
| [INJECT-002](inject.md#inject-002-agent) | a label that forges a log line | `notifications` | `createLabeledAlert(label: String!, symbol: String!, direction: AlertDirection!, threshold: Decimal!)` | `createAlert`, the label-record interceptor | A09 |
| [LOGIC-001](logic.md#logic-001-agent) | `payout`: a negative amount credits the wallet | `trading` | `payout(amount: Decimal!)` | `withdraw`, `POST /internal/wallets/withdraw` | A04 · API6 |
| [LOGIC-002](logic.md#logic-002-agent) | `payout`: the balance is read, then written | `trading` | `payout(amount: Decimal!)` | `withdraw`, `POST /internal/wallets/withdraw` | A04 · API6 |
| [LOGIC-003](logic.md#logic-003-agent) | `quickBuy`: the caller's price is the price | `trading` | `quickBuy(symbol: String!, quantity: Decimal!, price: Decimal!)` | `placeOrder`, `buyAtMarket` | A04 · API6 |
| [LOGIC-004](logic.md#logic-004-agent) | `convert`: money in a float | `trading` | `convert(asset: Asset!, amount: Float!)` | `convertExact`, `placeOrder` | A04 |
| [LOGIC-005](logic.md#logic-005-agent) | `matchOrder`: an order filled twice | `trading` | `matchOrder(orderId: ID!)` | `tickPrices`, `settleOrder` | A04 · API6 |
| [MONGO-001](mongo.md#mongo-001-agent) | the request body is the query filter | `accounts` | `POST /internal/sessions` | `signIn`, `POST /internal/sessions/typed` | A03 · API3 |
| [MONGO-002](mongo.md#mongo-002-agent) | a JSON filter forwarded to `find` | `accounts` | `findUsers(filter)` | `users(role, q)`, `searchUsers` | A03 · API3 |
| [MONGO-003](mongo.md#mongo-003-agent) | the bracketed query string is the filter | `accounts` | `GET /internal/users/filter` | `GET /internal/users`, `GET /internal/users/search` | A03 · API3 |
| [MONGO-004](mongo.md#mongo-004-agent) | text interpolated into `$regex` | `accounts` | `findUsersByName(q)` | `users(q)`, `searchUsers` | A03 · API3 |
| [MONGO-005](mongo.md#mongo-005-agent) | the caller names the sort and the projection | `accounts` | `findUsers(sortBy, fields)` | `users(orderBy)`, `searchUsers` | A03 · API3 |
| [MONGO-006](mongo.md#mongo-006-agent) | the preferences document is the `$set` | `accounts` | `updatePreferencesAll(prefs)` | `updatePreferences`, `setPreference` | A03 · API3 |
| [OS-001](os.md#os-001-agent) | a title that reaches a shell | `notifications` | `POST /internal/announcements/send` | `broadcastAnnouncement`, `POST /internal/announcements/notify` | A03 |
| [OS-002](os.md#os-002-agent) | an option where a URL was expected | `notifications` | `pingWebhook(url: String!)` | `previewWebhook`, `POST /internal/webhooks/test` | A03 |
| [PROTO-001](proto.md#proto-001-agent) | the dotted path is walked without checks | `accounts` | `setPreferenceByPath(path, value)` | `setPreference`, `setPreferencePath` | A08 |
| [PROTO-002](proto.md#proto-002-agent) | the settings string is parsed and deep-merged | `accounts` | `updateNotificationSettings(settings)` | `updatePreferences`, `importSettings` | A08 |
| [PROTO-003](proto.md#proto-003-agent) | a path that reaches every object | `notifications` | `setChannelByPath(path: String!, enabled: Boolean!)` | `setChannel`, `setChannels` | A08 |
| [RE-001](re.md#re-001-agent) | the display-name pattern backtracks | `accounts` | `updateDisplayName(name)` | `updateProfile`, `PUT /internal/profile` | A03 |
| [REDIR-001](redir.md#redir-001-agent) | the post-sign-in redirect follows `next` wherever it points | `gateway` | `GET /api/v1/auth/redirect` | `GET /api/v1/auth/continue`, `GET /api/v1/auth/continue-allowlisted` | A01 |
| [RES-001](res.md#res-001-agent) | no ceiling on the page the caller asks for | `accounts` | `usersAll(limit)` | `users`, `GET /internal/users/search` | A05 · API4 |
| [RES-002](res.md#res-002-agent) | no cap on `limit` | `trading` | `allTrades(symbol: String!, limit: Int!)` | `trades`, `tradesNamed` | A05 · API4 |
| [SQL-001](sql.md#sql-001-agent) | `orderLookup`: an untagged template literal | `trading` | `orderLookup(id: String!)` | `order(id)`, `orderByReference(ref)` | A03 · API3 |
| [SQL-002](sql.md#sql-002-agent) | `tradeHistory`: a `where` built by concatenation | `trading` | `tradeHistory(input: TradeHistoryInput!)` | `trades(symbol)`, `tradesNamed(symbol)` | A03 · API3 |
| [SQL-003](sql.md#sql-003-agent) | `searchMarkets`: a `LIKE` pattern concatenated | `trading` | `searchMarkets(q: String!)` | `markets(q)`, `marketsByAssets(assets)` | A03 · API3 |
| [SQL-004](sql.md#sql-004-agent) | `tradesSorted`: a caller-controlled sort column | `trading` | `tradesSorted(symbol: String!, sortBy: String!, sortDir: String!)` | `trades(orderBy)`, `tradesNamed` | A03 · API3 |
| [SQL-005](sql.md#sql-005-agent) | `volumeFor`: a tag that escapes quotes and joins | `trading` | `volumeFor(symbol: String!)` | `highPrice(symbol)`, `markets(q)` | A03 · API3 |
| [SQL-006](sql.md#sql-006-agent) | `feesPaid`: `execute()` on an interpolated string | `trading` | `feesPaid(symbol: String!)` | `settlementPrice(symbol)`, `orderByReference(ref)` | A03 · API3 |
| [SQL-007](sql.md#sql-007-agent) | `ordersByIds`: an `IN (…)` list joined from the ids | `trading` | `ordersByIds(ids: [ID!]!)` | `ordersAmong(ids)`, `orderByReference(ref)` | A03 · API3 |
| [SSRF-001](ssrf.md#ssrf-001-agent) | a webhook posted inside the lab | `notifications` | `testWebhook(url: String!)` | `setWebhookUrl(url)`, `registerWebhook(url)` | A10 · API7 |
| [SSRF-002](ssrf.md#ssrf-002-agent) | the avatar URL is fetched wherever it points | `accounts` | `POST /internal/profile/avatar` | `setAvatarUrl`, `POST /internal/profile/avatar/fetch` | A10 · API7 |
| [SSRF-003](ssrf.md#ssrf-003-agent) | a URL fetched and its body returned | `notifications` | `POST /internal/alerts/fetch` | `POST /internal/alerts/import`, `POST /internal/alerts/import-url` | A10 · API7 |
| [XSS-001](xss.md#xss-001-agent) | an announcement page that serves script | `notifications` | `GET /internal/announcements/:id/html` | `GET /internal/announcements/:id`, `GET /internal/announcements/:id/page` | A03 |
| [XSS-002](xss.md#xss-002-agent) | the stored upload served inline as its stored type | `accounts` | `GET /internal/documents/file/:name/view` | `GET /internal/documents/:id/view`, `GET /internal/documents/:id/image` | A03 |
| [XSS-003](xss.md#xss-003-agent) | the public status page greets the caller with their own markup | `gateway` | `GET /api/v1/public/status` | `GET /api/v1/status`, `GET /api/v1/status.json` | A03 |
| [XSS-004](xss.md#xss-004-agent) | a stored display name rendered unescaped | `accounts` | `GET /internal/admin/users-html` | `GET /internal/admin/users`, `GET /internal/admin/directory` | A03 |

## Vulnerable dependencies

The eight libraries pinned to vulnerable versions, each in the workspace its section names, with the advisory each version carries, are in [dependencies.md](dependencies.md). `tests/expected-audit.json` is the complete answer: 24 advisories.

## Scoring a scanner

Two files let a report be scored without reading the repository. Both are generated, committed, and never edited by hand.

| File | Use |
| --- | --- |
| `tests/expected-scanner-findings.json` | One row per vulnerable file and per counterpart file, 220 rows. `expectedFinding: true` must be flagged for the listed CWE: a miss is a false negative. `expectedFinding: false` is a protected counterpart: a report for the listed CWE is a false positive |
| `tests/expected-audit.json` | The dependency advisories, per workspace: 24. A missing one is a false negative; one attributed to the wrong workspace is wrong |

Both are generated from `catalog/catalog.json` and from `pnpm audit`, and both are checked in CI by `pnpm scenario:check` and `pnpm audit:check`. Each of the 77 also has a request named after it under `postman/`, which `pnpm test:api` runs under Newman.

## Safety

The lab runs on `127.0.0.1` only, with fake data, and is meant to be stopped after use. Several scenarios execute code on the machine that runs it. See [SECURITY.md](../../SECURITY.md).
