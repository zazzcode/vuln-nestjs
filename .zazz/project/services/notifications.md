# `notifications` — service specification

**Adapter:** Express, HTTP/1.1 on `127.0.0.1:3103` · **Store:** SQLite in memory, database `zazzles_notifications`
**Status:** design agreed with the Project Owner on 2026-11-26. Ready to build.

## 1. What it owns

Price alerts, the deliveries they cause, the webhook settings of a user, and announcements. It adds `alerts`, `deliveries`, `webhookUrl` and `notificationSettings` to the `User` entity owned by [`accounts`](accounts.md).

It calls no other service. It does make one kind of outbound request on purpose: the webhook delivery, to a URL a user chose. That is where its request-forgery scenarios live.

This is the one service on the Express adapter. It uses what Express is used for: `express.json()` as middleware, a NestJS middleware class, and views rendered with `ejs` through `res.render()`.

## 2. Data

| Entity | Fields |
| --- | --- |
| `Alert` | `userId`, `symbol`, `direction` (`ABOVE`, `BELOW`), `threshold`, `label`, `expression` (only for a smart alert), `enabled`, `lastTriggeredAt`, `createdAt` |
| `Delivery` | `alertId`, `userId`, `url`, `status` (`PENDING`, `DELIVERED`, `FAILED`), `attempts`, `lastError`, `responseBody`, `createdAt`, `deliveredAt` |
| `Announcement` | `title`, `body`, `authorId`, `createdAt`, `sentAt` |
| `UserSettings` | `userId` (unique), `webhookUrl`, `email`, `sms`, `webhook` |

### How an alert is delivered

1. A client calls `tickPrices` on `trading`, which it does not need to know about.
2. The client calls `evaluateAlerts(prices)` here with the new prices.
3. Every enabled alert whose threshold was crossed produces one delivery to the owner's webhook URL, signed with `X-Zazzles-Signature` (HMAC-SHA256 of the body).
4. The delivery attempt is recorded, whatever happened.

There is no queue and there are no retries. One attempt, recorded.

## 3. Fake data

| Data | Values |
| --- | --- |
| Alerts | One per user, on different markets, enabled |
| Webhook URLs | `http://127.0.0.1:4010/webhook/<name>` for each user: the loopback test receiver |
| Settings | Every channel on |
| Announcements | One, with plain text |
| Deliveries | None |

## 4. API

### GraphQL types

```graphql
type Alert @key(fields: "id") { id: ID! userId: ID! symbol: String! direction: AlertDirection! threshold: Decimal! label: String enabled: Boolean! lastTriggeredAt: DateTime createdAt: DateTime! }
type Delivery @key(fields: "id") { id: ID! alertId: ID url: String! status: DeliveryStatus! attempts: Int! lastError: String createdAt: DateTime! deliveredAt: DateTime }
type Announcement @key(fields: "id") { id: ID! title: String! body: String! authorId: ID! createdAt: DateTime! sentAt: DateTime }
type UserSettings { webhookUrl: String email: Boolean! sms: Boolean! webhook: Boolean! }
type User @key(fields: "id") { id: ID! @external alerts: [Alert!]! deliveries(limit: Int, offset: Int): [Delivery!]! webhookUrl: String notificationSettings: JSON! }
enum AlertDirection { ABOVE BELOW }
enum DeliveryStatus { PENDING DELIVERED FAILED }
enum ChannelName { EMAIL SMS WEBHOOK }
input CreateAlertInput { symbol: String! direction: AlertDirection! threshold: Decimal! label: String }
input RuleInput { symbol: String! direction: AlertDirection! threshold: Decimal! }
input ChannelsInput { email: Boolean sms: Boolean webhook: Boolean }
input NotificationSettingsInput { email: Boolean! sms: Boolean! webhook: Boolean! }
input PriceInput { symbol: String! price: Decimal! }
input AnnouncementInput { title: String! body: String! }
```

### GraphQL operations

| Operation | Kind | Caller | Scenario | What it does |
| --- | --- | --- | --- | --- |
| `alerts(limit: Int, offset: Int): [Alert!]!` | safe | user | | The caller's alerts |
| `deliveries(alertId: ID, limit: Int, offset: Int): [Delivery!]!` | safe | user | | The caller's deliveries |
| `announcements(limit: Int, offset: Int): [Announcement!]!` | safe | public | | |
| `User.alerts`, `User.deliveries`, `User.webhookUrl`, `User.notificationSettings` | safe | user | | For the user the gateway resolved |
| `createAlert(input: CreateAlertInput!): Alert!` | safe | user | | A structured alert. The label is logged as data |
| `createRuleAlert(rule: RuleInput!): Alert!` | safe | user | | A structured rule, compared with an operator |
| `deleteAlert(id: ID!): Alert!` | safe | user | | Own alerts only |
| `setWebhookUrl(url: String!): UserSettings!` | safe | user | | The URL is checked against the allowlist when it is saved |
| `registerWebhook(url: String!): UserSettings!` | safe | user | | The URL is checked when anything is sent to it |
| `updateNotificationSettings(input: NotificationSettingsInput!): UserSettings!` | safe | user | | Typed fields only |
| `setChannel(name: ChannelName!, enabled: Boolean!): UserSettings!` | safe | user | | An enum name |
| `setChannels(input: ChannelsInput!): UserSettings!` | safe | user | | Typed fields only |
| `importAlerts(json: String!): [Alert!]!` | safe | user | | Takes the content. Fetches nothing |
| `previewWebhook(url: String!): Delivery!` | safe | user | | One delivery, behind the outbound guard |
| `evaluateAlerts(prices: [PriceInput!]!): [Delivery!]!` | safe | admin | | Evaluates every enabled alert against the prices, and delivers |
| `broadcastAnnouncement(input: AnnouncementInput!): Announcement!` | safe | admin | | A fixed template, with the input as data. `execFile` with a fixed argument vector |
| `testWebhook(url: String!): Delivery!` | vulnerable | user | SSRF-001 | Posts to any URL, `http://127.0.0.1:3102/internal/…` included |
| `pingWebhook(url: String!): Delivery!` | vulnerable | user | OS-002 | `execFile('curl', [url])`. A URL that starts with `-` is an option |
| `createSmartAlert(expression: String!): Alert!` | vulnerable | user | DESER-002 | The expression is stored and run with `eval` at evaluation |
| `setChannelByPath(path: String!, enabled: Boolean!): UserSettings!` | vulnerable | user | PROTO-003 | `dot-prop` `set` with the caller's path |
| `createLabeledAlert(label: String!, symbol: String!, direction: AlertDirection!, threshold: Decimal!): Alert!` | vulnerable | user | INJECT-002 | The label is written into a log line as it is |
| `alertsOf(userId: ID!): [Alert!]!` | vulnerable | user | ACCESS-006 | Any user's alerts, and its webhook URL |

### REST endpoints

| Gateway path → service path | Kind | Caller | Scenario |
| --- | --- | --- | --- |
| `GET /api/v1/deliveries` → `GET /internal/deliveries` | safe | user | |
| `GET /api/v1/announcements` → `GET /internal/announcements` | safe | public | JSON, `nosniff` |
| `GET /api/v1/announcements/:id` → `GET /internal/announcements/:id` | safe | public | JSON, `nosniff` |
| `GET /api/v1/announcements/:id/page` → `GET /internal/announcements/:id/page` | safe | public | HTML from an escaped template, with CSP |
| `POST /api/v1/webhooks/test` → `POST /internal/webhooks/test` | safe | user | Behind the outbound guard |
| `POST /api/v1/alerts/import` → `POST /internal/alerts/import` | safe | user | Takes the content |
| `POST /api/v1/alerts/import-url` → `POST /internal/alerts/import-url` | safe | user | Behind the outbound guard |
| `POST /api/v1/admin/announcements` → `POST /internal/announcements` | safe | admin | A fixed template. `execFile` |
| `POST /api/v1/admin/announcements/notify` → `POST /internal/announcements/notify` | safe | admin | In-process send, plain text |
| `POST /api/v1/alerts/fetch` → `POST /internal/alerts/fetch` | vulnerable | user | SSRF-003 |
| `POST /api/v1/admin/announcements/send` → `POST /internal/announcements/send` | vulnerable | admin | OS-001, DESER-003 |
| `GET /api/v1/announcements/:id.html` → `GET /internal/announcements/:id/html` | vulnerable | public | XSS-001 |

**Counts.** 10 scenarios on 9 vulnerable operations. 29 safe operations: 20 GraphQL, the four `User` fields included, and 9 REST. More than three safe for every vulnerable one.

**Dependency versions this service is built with.** `ejs` 3.1.10, `node-fetch` 2.7.0 and `dot-prop` 4.1.0. The first two are the controls for SCA-004 and SCA-003; the third is the pin SCA-006, because PROTO-003 is not exploitable without it.

## 5. Scenarios

### `SSRF` — server-side request forgery

The outbound guard, used by every protected counterpart here: the scheme must be `http` or `https`; the host must resolve to loopback; the port must be on the allowlist in `WEBHOOK_ALLOWED_ORIGINS` (the test receiver on `4010` by default), which excludes the gateway and the three services; redirects are not followed; the timeout is 5 seconds.

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| SSRF-001 | A webhook posted to any URL. `http://127.0.0.1:3102/internal/wallets/<id>` is reached from inside the machine (CWE-918) | `testWebhook` | `setWebhookUrl`: refused at save time | `registerWebhook`: refused at delivery time |
| SSRF-003 | A URL is fetched and the response is returned, so an internal endpoint can be read (CWE-918) | `POST /api/v1/alerts/fetch` | `POST /api/v1/alerts/import`: takes the content, fetches nothing | `POST /api/v1/alerts/import-url`: behind the guard |

### `OS` — command and argument injection

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| OS-001 | The title interpolated into a shell command: `` exec(`node scripts/notify.js --title "${title}"`) `` (CWE-78) | `POST /api/v1/admin/announcements/send` | `broadcastAnnouncement`: `execFile(process.execPath, […, '--title', title])` | `POST /api/v1/admin/announcements/notify`: a function call, no process |
| OS-002 | `execFile('curl', [url])` with no validation. `--config` or `-o` in place of a URL is an option (CWE-88) | `pingWebhook` | `previewWebhook`: an HTTP client, no `curl` | `POST /api/v1/webhooks/test`: the guard refuses the URL before any process could start |

### `DESER` — code and template injection

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| DESER-002 | A user expression run with `eval` at evaluation (CWE-95) | `createSmartAlert` | `createAlert`: symbol, direction, threshold | `createRuleAlert`: a structured rule, compared with an operator |
| DESER-003 | The announcement body compiled as a template: `ejs.render(body, user)`. `<%= 7*7 %>` renders `49` (CWE-1336) | `POST /api/v1/admin/announcements/send` | `broadcastAnnouncement`: a fixed template, the body as data | `POST /api/v1/admin/announcements/notify`: plain text |

### `XSS`, `PROTO`, `INJECT`, `ACCESS`

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| XSS-001 | Stored script in an announcement page: the body rendered with `<%- body %>`. `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">` is served as `text/html` (CWE-79) | `GET /api/v1/announcements/:id.html` | `GET /api/v1/announcements/:id`: JSON, `nosniff` | `GET /api/v1/announcements/:id/page`: `<%= body %>`, escaped, with CSP |
| PROTO-003 | `dotProp.set(settings, path, enabled)` with the caller's path. `__proto__.webhook` reaches every object (CWE-1321) | `setChannelByPath` | `setChannel`: an enum | `setChannels`: typed input |
| INJECT-002 | The alert label written into a log line as it is. A newline forges a line that reads like an administrator action (CWE-117) | `createLabeledAlert` | `createAlert`: the label is logged with `JSON.stringify` | A logging interceptor that records the label as a field |
| ACCESS-006 | Any user's alerts and webhook URL by `userId` (CWE-639) | `alertsOf` | `alerts`: the caller's own | `User.alerts`: reached only for the caller's own user or through an admin operation |

**PROTO-003 needs `dot-prop` 4.1.0 to be exploitable.** From 4.2.1, `set` refuses `__proto__` in a path. The service is built with 4.1.0, which is the pin SCA-006 in the [dependency document](../../../docs/vulnerabilities/dependencies.md).

## 6. API tests

The service is tested on its own: `apps/notifications/test/` starts it, with its SQLite in memory and a loopback webhook receiver on `4010`, and calls `127.0.0.1:3103` directly. No other service runs.

| Suite | What it proves |
| --- | --- |
| Functional | Every safe operation does what its row says. A crossed alert produces a delivery whose signature the receiver verifies |
| Authorization | Every admin operation refuses a user. Every own-data operation refuses another user's object |
| Scenario, both directions | For each of the 10 scenarios: one payload, sent to the vulnerable operation and to each counterpart |
| Stop | The service stops and leaves nothing behind |

Harmless markers: a request to `http://127.0.0.1:3102/internal/health` observed through SSRF-001; `; echo zazzles-lab-marker` in a title, read back from the delivery record; `<%= 7*7 %>` rendered as `49`; `window.__zazzles = "zazzles-lab-marker"` served unescaped through XSS-001.

## 7. Out of scope

A delivery queue, retries, back-off, real email or SMS, anything that only matters for an application that stays up.
