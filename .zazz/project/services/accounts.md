# `accounts` — service specification

**Adapter:** Fastify, HTTP/2 on `127.0.0.1:3101` · **Store:** MongoDB, database `zazzles_accounts`
**Status:** design agreed with the Project Owner on 2026-11-26. Ready to build.

## 1. What it owns

Users, passwords, sign-in, sessions, profile, preferences and uploaded documents. It owns the `User` entity of the federated graph. It does not own money: wallets, deposits and orders are in [`trading`](trading.md).

It calls no other service.

## 2. Data

| Entity | Fields | Indexes |
| --- | --- | --- |
| `User` | `email`, `displayName`, `passwordHash`, `role` (`ADMIN`, `USER`), `preferences` (an object), `avatarUrl`, `createdAt`, `updatedAt` | unique `email` |
| `Session` | `userId`, `revokedAt`, `expiresAt`, `createdAt` | `userId` |
| `Document` | `userId`, `storedName`, `originalName`, `mimeType`, `size`, `createdAt` | `userId` |

Passwords are scrypt hashes from Node's `crypto`: `scrypt$N$r$p$salt$hash`. A sign-in accepts either that or a legacy `$sha1$…` hash, which is what CRYPTO-01 relies on.

## 3. Fake data

| Data | Values |
| --- | --- |
| Administrator | `admin@zazzles.exchange`, password `admin-lab-only`, role `ADMIN` |
| Users | `alice`, `bob`, `carol`, `dave`, `erin` at `@zazzles.exchange`, passwords `<name>-lab-only`, role `USER` |
| Preferences | Each user: `{ theme: "dark", language: "en", currency: "USD", marketingEmails: "false" }` |
| Documents | One PNG and one PDF for alice |

## 4. API

### GraphQL types

```graphql
type User @key(fields: "id") { id: ID! email: String! displayName: String! role: Role! preferences: JSON! avatarUrl: String createdAt: DateTime! }
type UserRecord { id: ID! email: String! displayName: String! passwordHash: String! role: Role! }
type Session { id: ID! userId: ID! createdAt: DateTime! expiresAt: DateTime! }
type Document { id: ID! originalName: String! mimeType: String! size: Int! createdAt: DateTime! }
type UserStats { total: Int! admins: Int! users: Int! }
type AuthPayload { accessToken: String! user: User! }
enum Role { ADMIN USER }
enum PreferenceName { THEME LANGUAGE CURRENCY MARKETING_EMAILS }
enum UserOrderBy { NEWEST OLDEST EMAIL DISPLAY_NAME }
input CreateUserInput { email: String! displayName: String! password: String! role: Role }
input UpdateProfileInput { displayName: String email: String }
input UpdatePreferencesInput { theme: String language: String currency: String marketingEmails: String }
input UserSearchInput { q: String role: Role }
```

### GraphQL operations

| Operation | Kind | Caller | Scenario | What it does |
| --- | --- | --- | --- | --- |
| `me: User` | safe | user | | The caller's profile |
| `sessionInfo: Session` | safe | user | | The caller's session |
| `sessions: [Session!]!` | safe | user | | The caller's sessions |
| `documents: [Document!]!` | safe | user | | The caller's documents |
| `user(id: ID!): User` | safe | admin | | One user |
| `users(role: Role, q: String, orderBy: UserOrderBy, limit: Int, offset: Int): [User!]!` | safe | admin | | A page. `q` is an escaped, anchored match on the display name |
| `searchUsers(query: UserSearchInput!, limit: Int, offset: Int): [User!]!` | safe | admin | | A DTO with two allowlisted fields |
| `userStats: UserStats!` | safe | admin | | Counts by role |
| `signIn(email: String!, password: String!): AuthPayload!` | safe | public | | Locks the account for a minute after 5 failures |
| `signOut: Boolean!` | safe | user | | Revokes the session |
| `deleteSession(id: ID!): Boolean!` | safe | user | | Own sessions only |
| `createUser(input: CreateUserInput!): User!` | safe | admin | | scrypt |
| `updateProfile(input: UpdateProfileInput!): User!` | safe | user | | Typed fields only |
| `updatePreferences(input: UpdatePreferencesInput!): User!` | safe | user | | Typed fields only |
| `setPreference(name: PreferenceName!, value: String!): User!` | safe | user | | An enum name |
| `setPreferencePath(path: String!, value: String!): User!` | safe | user | | A dotted path, checked segment by segment |
| `importSettings(settings: String!): User!` | safe | user | | JSON text, parsed, then validated against a DTO |
| `changePassword(currentPassword: String!, newPassword: String!): Boolean!` | safe | user | | |
| `requestPasswordReset(email: String!): Boolean!` | safe | public | | The same response whether or not the account exists |
| `resetPassword(userId: ID!): String!` | safe | admin | | A new password from `crypto.randomBytes` |
| `setAvatarUrl(url: String!): User!` | safe | user | | Stores a URL. Fetches nothing |
| `whoAmI: UserRecord` | vulnerable | any token | AUTH-001, CRYPTO-003, GQL-005 | Checked by `LegacyTokenGuard`. Returns the password hash |
| `userPreferences(userId: ID!): JSON` | vulnerable | user | ACCESS-001 | Any user's email and preferences |
| `findUsers(filter: JSON, sortBy: String, fields: JSON, limit: Int): [JSON!]!` | vulnerable | user | MONGO-002, MONGO-005 | Filter, sort and projection forwarded to MongoDB |
| `findUsersByName(q: String!, limit: Int): [User!]!` | vulnerable | user | MONGO-004 | `q` interpolated into `$regex` |
| `usersAll(limit: Int): [User!]!` | vulnerable | user | RES-001 | No cap on `limit` |
| `quickSignIn(email: String!, password: String!): AuthPayload!` | vulnerable | public | AUTH-003, INFO-001 | No lockout. Logs the password |
| `signOutLegacy: Boolean!` | vulnerable | user | AUTH-004 | Revokes nothing |
| `checkAccount(email: String!): Boolean!` | vulnerable | public | AUTH-005 | Says whether the account exists |
| `signUp(email: String!, password: String!, displayName: String!): AuthPayload!` | vulnerable | public | CRYPTO-001 | Unsalted SHA-1 |
| `recoverPassword(email: String!): String` | vulnerable | public | CRYPTO-002 | Returns a code from `Math.random()` |
| `createUserAccount(input: CreateUserInput!): User!` | vulnerable | user | ACCESS-003 | No role check |
| `updatePreferencesAll(prefs: JSON!): User!` | vulnerable | user | MONGO-006 | `prefs` is the `$set` document |
| `setPreferenceByPath(path: String!, value: JSON!): User!` | vulnerable | user | PROTO-001 | Walks the path without checks |
| `updateNotificationSettings(settings: String!): User!` | vulnerable | user | PROTO-002 | Parses the string and deep-merges it |
| `updateDisplayName(name: String!): User!` | vulnerable | user | RE-001 | Validated with a backtracking pattern |

### REST endpoints

The gateway path is what a client calls. The service path is what the gateway calls.

| Gateway path → service path | Kind | Caller | Scenario |
| --- | --- | --- | --- |
| `POST /api/v1/auth/sign-in` → `POST /internal/sessions/typed` | safe | public | |
| `POST /api/v1/auth/session` → `POST /internal/sessions/signed` | safe | user | |
| `POST /api/v1/auth/introspect` → `POST /internal/sessions/introspect` | safe | user | |
| `POST /api/v1/auth/sign-out` → `POST /internal/sessions/revoke` | safe | user | |
| `POST /api/v1/auth/resume` → `POST /internal/sessions/resume` | safe | public | |
| `PUT /api/v1/profile` → `PUT /internal/profile` | safe | user | |
| `POST /api/v1/profile/avatar/fetch` → `POST /internal/profile/avatar/fetch` | safe | user | |
| `POST /api/v1/profile/documents` → `POST /internal/documents` | safe | user | |
| `POST /api/v1/profile/documents/checked` → `POST /internal/documents/checked` | safe | user | |
| `GET /api/v1/profile/documents` → `GET /internal/documents` | safe | user | |
| `GET /api/v1/profile/documents/:id` → `GET /internal/documents/:id` | safe | user | |
| `GET /api/v1/profile/documents/by-name/:name` → `GET /internal/documents/by-name/:name` | safe | user | |
| `GET /api/v1/profile/documents/:id/view` → `GET /internal/documents/:id/view` | safe | user | |
| `GET /api/v1/profile/documents/:id/image` → `GET /internal/documents/:id/image` | safe | user | |
| `GET /api/v1/users?role=&q=&limit=&offset=` → `GET /internal/users` | safe | admin | |
| `GET /api/v1/users/search` → `GET /internal/users/search` | safe | admin | |
| `POST /api/v1/admin/users` → `POST /internal/admin/users` | safe | admin | |
| `GET /api/v1/admin/users` → `GET /internal/admin/users` | safe | admin | |
| `GET /api/v1/admin/directory.html` → `GET /internal/admin/directory` | safe | admin | |
| — `GET /internal/users/lookup` | safe | service token | |
| `GET /api/v1/auth/whoami` → `GET /internal/sessions/decoded` | vulnerable | any token | AUTH-002 |
| `POST /api/v1/auth/login` → `POST /internal/sessions` | vulnerable | public | MONGO-001 |
| `POST /api/v1/auth/token` → `POST /internal/sessions/token` | vulnerable | public | COOKIE-001, INFO-001 |
| `POST /api/v1/auth/remember` → `POST /internal/sessions/remember` | vulnerable | public | COOKIE-002 |
| `POST /api/v1/auth/refresh` → `POST /internal/sessions/resume-legacy` | vulnerable | public | DESER-001 |
| `PATCH /api/v1/profile` → `PATCH /internal/profile` | vulnerable | user | ACCESS-004 |
| `POST /api/v1/profile/avatar` → `POST /internal/profile/avatar` | vulnerable | user | SSRF-002 |
| `POST /api/v1/profile/documents/legacy` → `POST /internal/documents/legacy` | vulnerable | user | FS-002, FS-003 |
| `GET /api/v1/profile/documents/file/:name` → `GET /internal/documents/file/:name` | vulnerable | user | FS-001 |
| `GET /api/v1/profile/documents/file/:name/view` → `GET /internal/documents/file/:name/view` | vulnerable | user | XSS-002 |
| `GET /api/v1/users/filter` → `GET /internal/users/filter` | vulnerable | admin | MONGO-003 |
| `GET /api/v1/admin/users.html` → `GET /internal/admin/users-html` | vulnerable | admin | XSS-004 |
| — `GET /internal/me` | vulnerable | trusts `x-user-id` | ACCESS-005 |

**Counts.** 33 scenarios on 28 vulnerable operations. 41 safe operations: 21 GraphQL and 20 REST. About 1.5 safe for every vulnerable one.

## 5. Scenarios

### `AUTH` — authentication and sessions

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| AUTH-001 | `LegacyTokenGuard` calls `jwt.verify(token, key)` with no `algorithms`. A token signed with the RSA public key as an HMAC secret is accepted as admin (CWE-347) | `whoAmI` | `me`: `algorithms: ['HS256']` | `sessionInfo`: `@nestjs/jwt` with the algorithms configured |
| AUTH-002 | `jwt.decode(token)` is treated as proof. The signature is never checked (CWE-347) | `GET /api/v1/auth/whoami` | `me` | `POST /api/v1/auth/introspect`: signature and session |
| AUTH-003 | No lockout and no rate limit. Aliased mutations try many passwords in one request (CWE-307) | `quickSignIn` | `signIn`: 5 failures lock the account | `POST /api/v1/auth/sign-in`: `@fastify/rate-limit`, 10 a minute |
| AUTH-004 | Sign-out revokes nothing. The token still works (CWE-613) | `signOutLegacy` | `signOut`: the session is marked revoked and the guard checks | `POST /api/v1/auth/sign-out`: the same, and clears the cookie |
| AUTH-005 | The answer differs for an account that exists (CWE-204) | `checkAccount` | `requestPasswordReset`: one answer for both cases | `signIn`: one message for a wrong email and a wrong password |

### `CRYPTO` — cryptographic failures

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| CRYPTO-001 | The password stored as unsalted SHA-1 (CWE-759, CWE-916) | `signUp` | `createUser`: scrypt | `POST /api/v1/admin/users`: scrypt, one salt per user |
| CRYPTO-002 | A reset code from `Math.random()` (CWE-338) | `recoverPassword` | `requestPasswordReset`: `crypto.randomInt` | `resetPassword`: `crypto.randomBytes` |
| CRYPTO-003 | A hard-coded secret used when `JWT_SECRET` is unset (CWE-798) | `whoAmI`, in the legacy guard | `me`: the guard's secret comes from a validated configuration | `sessionInfo`: `JwtModule` configured from the same |

### `ACCESS` — authorization

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| ACCESS-001 | Another user's email and preferences by `userId`, with no ownership check (CWE-639) | `userPreferences` | `me` | `user(id)`: admin only |
| ACCESS-003 | A user creates accounts. Only a token is required (CWE-862) | `createUserAccount` | `createUser`: `@Roles('ADMIN')` | `POST /api/v1/admin/users`: roles guard and DTO |
| ACCESS-004 | A DTO without `whitelist`. `Object.assign(user, dto)` writes `role` (CWE-915) | `PATCH /api/v1/profile` | `updateProfile`: typed input | `PUT /api/v1/profile`: whitelist on, fields copied by name |
| ACCESS-005 | An internal endpoint reads `x-user-id` and believes it. A local caller sets the header (CWE-807) | `GET /internal/me` | `POST /internal/sessions/introspect`: the token is verified | `GET /internal/users/lookup`: service token |

### `MONGO` — NoSQL operator injection

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| MONGO-001 | The request body is the query filter. `{"email":{"$ne":null},"password":{"$ne":null}}` signs in (CWE-943) | `POST /api/v1/auth/login` | `signIn`: scalar arguments, the filter built field by field | `POST /api/v1/auth/sign-in`: the schema rejects a value that is not a string |
| MONGO-002 | A `JSON` filter forwarded to `find` (CWE-943) | `findUsers(filter)` | `users(role, q)`: typed arguments | `searchUsers(query)`: a DTO with two allowlisted fields |
| MONGO-003 | `?filter[role]=ADMIN` parsed into an object and used as the filter (CWE-943) | `GET /api/v1/users/filter` | `GET /api/v1/users`: flat parameters | `GET /api/v1/users/search`: validated through a DTO |
| MONGO-004 | `q` interpolated into `$regex`, unescaped (CWE-943) | `findUsersByName` | `users(q)`: escaped and anchored | `searchUsers`: a text index, no regular expression |
| MONGO-005 | `sortBy` and `fields` forwarded as the sort and the projection (CWE-943) | `findUsers` | `users(orderBy)`: an enum mapped to a field | `searchUsers`: a fixed sort |
| MONGO-006 | `prefs` is the `$set` document. `{"role":"ADMIN"}` (CWE-915) | `updatePreferencesAll` | `updatePreferences`: typed input | `setPreference(name)`: an enum |

### `PROTO` — prototype pollution

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| PROTO-001 | A dotted path walked without checks. `__proto__.role` sets the role of every user object in the process (CWE-1321) | `setPreferenceByPath` | `setPreference`: an enum | `setPreferencePath`: allowlisted segments, own-property checks, a null-prototype map |
| PROTO-002 | A string parsed and deep-merged. `{"__proto__":{"role":"ADMIN"}}` pollutes the prototype. The string form gets past the JSON parser's own guard (CWE-1321) | `updateNotificationSettings` | `updatePreferences`: typed input | `importSettings`: parsed, then a DTO rejects unknown properties |

### `FS` — files, and `XSS` — cross-site scripting

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| FS-001 | The file name joined to the directory: `..%2F..%2Fpackage.json` (CWE-22) | `GET …/documents/file/:name` | `GET …/documents/:id`: the name comes from the database | `GET …/documents/by-name/:name`: resolved and checked |
| FS-002 | The uploaded file is stored under its own name (CWE-22) | `POST …/documents/legacy` | `POST …/documents`: a generated name | `POST …/documents/checked`: the name is checked |
| FS-003 | Any type accepted, HTML and SVG included (CWE-434) | `POST …/documents/legacy` | `POST …/documents`: extension and size allowlist | `POST …/documents/checked`: plus the file signature |
| XSS-002 | An uploaded file served inline with its stored content type (CWE-79) | `GET …/documents/file/:name/view` | `GET …/documents/:id/view`: an attachment | `GET …/documents/:id/image`: images only |
| XSS-004 | Display names rendered into HTML unescaped (CWE-79) | `GET /api/v1/admin/users.html` | `GET /api/v1/admin/users`: JSON and `nosniff` | `GET /api/v1/admin/directory.html`: escaped, CSP |

### `SSRF`, `COOKIE`, `DESER`, `RE`, `RES`, `INFO`, `GQL`

| ID | Weakness and sink | Vulnerable | Protected 1 | Protected 2 |
| --- | --- | --- | --- | --- |
| SSRF-002 | The avatar URL is fetched wherever it points, and redirects are followed. `http://127.0.0.1:3102/internal/…` is reached (CWE-918) | `POST /api/v1/profile/avatar` | `setAvatarUrl`: stores, fetches nothing | `POST …/avatar/fetch`: allowlisted origin, no redirects |
| COOKIE-001 | A cookie set without `HttpOnly` (CWE-1004) | `POST /api/v1/auth/token` | `POST /api/v1/auth/sign-in`: `HttpOnly`, `SameSite=Strict` | `POST /api/v1/auth/session`: signed, `HttpOnly`, `SameSite=Lax` |
| COOKIE-002 | A 30-day cookie without `SameSite` (CWE-1275) | `POST /api/v1/auth/remember` | `POST /api/v1/auth/sign-in` | `POST /api/v1/auth/session` |
| DESER-001 | The remember-me cookie passed to `node-serialize` `unserialize` (CWE-502) | `POST /api/v1/auth/refresh` | `POST /api/v1/auth/resume`: a signed cookie, `JSON.parse`, a schema | `POST /api/v1/auth/introspect`: the session record decides |
| RE-001 | A pattern with nested quantifiers, `/^([a-zA-Z0-9_ ]+)*$/` (CWE-1333) | `updateDisplayName` | `updateProfile`: a linear pattern and a length cap | `PUT /api/v1/profile`: a character allowlist, no regular expression |
| RES-001 | No cap on `limit` (CWE-770) | `usersAll` | `users`: capped | `searchUsers`: a cursor |
| INFO-001 | The password and the token written to the log (CWE-532) | `POST /api/v1/auth/token` | `signIn`: the user id only | `POST /api/v1/auth/sign-in`: an interceptor that redacts named fields |
| GQL-005 | `passwordHash` is a field of `UserRecord` (CWE-200) | `whoAmI` | `me`: `User` has no such field | `user(id)`: admin only, and still no such field |

## 6. API tests

The service is tested on its own: `apps/accounts/test/` starts it with its own in-memory MongoDB and calls `127.0.0.1:3101` directly. No other service runs.

| Suite | What it proves |
| --- | --- |
| Functional | Every safe operation does what its row says, with the fake data |
| Authorization | Every admin operation refuses a user. Every own-data operation refuses a request for another user's object |
| Scenario, both directions | For each of the 33 scenarios: one payload, sent to the vulnerable operation and to each counterpart. The exploit assertion names what was gained. The counterpart assertion names why it was refused |
| Reset | After `POST /internal/lab/reset` every document is back to the fake data, including users changed by an exploit |
| Stop | After the service stops, no `mongod` process and no temporary directory remain |

The payload for every scenario uses a harmless marker. Examples: a forged token whose `role` is `ADMIN`; the file `package.json` read through FS-001; `window.__zazzles = "zazzles-lab-marker"` stored through XSS-004; a call to `http://127.0.0.1:3102/internal/health` observed through SSRF-002.

## 7. Out of scope

Money, orders, alerts, email delivery, a real identity provider, anything that only matters for an application that stays up.
