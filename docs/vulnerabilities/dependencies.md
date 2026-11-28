# Vulnerable dependencies (SCA)

**Status: installed.** All eight pins are in the workspaces their sections name, as the four `package.json` files declare them, and `pnpm audit:check` finds `tests/expected-audit.json` true: 24 advisories, the complete answer. This page is its summary.

The versions and their advisories were checked on 2026-11-26 against the GitHub Advisory Database, through its API, and against the npm registry. Where the audit differs from that reading, the section says so.

The pins have no reproduction of their own beyond `pnpm audit:lab`, the raw production audit. Run on 2026-11-28, it reports 24 vulnerabilities (8 moderate, 12 high, 4 critical) and exits 1: a nonzero exit is the lab working. Three of the pins are needed by a scenario's exploit, which is reproduced in that scenario's module: [AUTH-001](auth.md#auth-001-exploit), [DESER-001](deser.md#deser-001-exploit) and [PROTO-003](proto.md#proto-003-exploit).

## Rules

- **One workspace per pin.** Each vulnerable version is declared in one service's `package.json`. Where the lab has a real use for the same library elsewhere, that service uses a patched version, and it is the control.
- **A pin is never upgraded.** Every advisory below is a finding the dependency scanner must report. Retiring a pin is its own change, which names the advisory.
- **No malware.** Vulnerable code is a scenario; malicious code is not.
- **Libraries with a constant flow of new advisories are left out**, because each new advisory moves the snapshot. That is why `axios` and `handlebars` are absent, as in vuln-nextjs.
- **A pin arrives together with its reachability statement, its tests and the new audit snapshot**, in the same change.

## The pins

Severity is the advisory's own rating. "Fixed in" is the first version without the advisory.

### SCA-001 — `jsonwebtoken` 8.5.1 in `apps/accounts`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-27h2-hvpr-p74q](https://github.com/advisories/GHSA-27h2-hvpr-p74q) · CVE-2022-23529 | High | Insecure input validation in `jwt.verify` | 9.0.0 |
| [GHSA-8cf7-32gw-wr33](https://github.com/advisories/GHSA-8cf7-32gw-wr33) · CVE-2022-23539 | High | Unrestricted key type allows legacy keys | 9.0.0 |
| [GHSA-hjrf-2m68-5959](https://github.com/advisories/GHSA-hjrf-2m68-5959) · CVE-2022-23541 | Medium | Insecure key retrieval: a token can be forged from RSA to HMAC | 9.0.0 |
| [GHSA-qwph-4952-7xr6](https://github.com/advisories/GHSA-qwph-4952-7xr6) · CVE-2022-23540 | Medium | Signature validation bypass through the insecure default algorithm of `jwt.verify()` | 9.0.0 |

The audit returns three of the four for 8.5.1: GHSA-8cf7-32gw-wr33, GHSA-hjrf-2m68-5959 and GHSA-qwph-4952-7xr6. GHSA-27h2-hvpr-p74q is the database's and is not returned; the answer key has three.

**Control:** `jsonwebtoken` 9.0.3, which `@nestjs/jwt` 12.0.5 brings into every workspace, `accounts` included, beside the pin. The safe guard of every service verifies through it. No advisory.

### SCA-002 — `lodash` 4.17.20 in `apps/accounts`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-35jh-r3h4-6jhm](https://github.com/advisories/GHSA-35jh-r3h4-6jhm) · CVE-2021-23337 | High | Command injection in `_.template` | 4.17.21 |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) · CVE-2026-4800 | High | Code injection through the `imports` key names of `_.template` | 4.18.0 |
| [GHSA-29mw-wpgm-hmr9](https://github.com/advisories/GHSA-29mw-wpgm-hmr9) · CVE-2020-28500 | Medium | Regular expression denial of service | 4.17.21 |
| [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) · CVE-2025-13465 | Medium | Prototype pollution in `_.unset`, `_.omit` and `_.pullAt` | 4.17.23 |
| [GHSA-8p5q-j9m2-g8wr](https://github.com/advisories/GHSA-8p5q-j9m2-g8wr) · CVE-2021-41720 | Low | Withdrawn advisory | none |

The audit returns four: all but the withdrawn GHSA-8p5q-j9m2-g8wr.

**Control:** none declared. No other workspace depends on `lodash`; the store resolves 4.17.21 as a transitive dependency, and the audit reports no advisory for it.

### SCA-003 — `node-fetch` 2.6.6 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-r683-j2x4-v87g](https://github.com/advisories/GHSA-r683-j2x4-v87g) · CVE-2022-0235 | High | Forwards secure headers to untrusted sites on redirect | 2.6.7 |

The audit returns it.

**Control:** `node-fetch` 2.7.0 in `apps/accounts`, which fetches an avatar through it. No advisory.

### SCA-004 — `ejs` 3.1.6 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-phwq-j96m-2c2q](https://github.com/advisories/GHSA-phwq-j96m-2c2q) · CVE-2022-29078 | Critical | Server-side template injection | 3.1.7 |
| [GHSA-ghr5-ch3p-vcr6](https://github.com/advisories/GHSA-ghr5-ch3p-vcr6) · CVE-2024-33883 | Medium | Lacks certain pollution protection | 3.1.10 |

The audit returns both.

**Control:** `ejs` 3.1.10 in `apps/accounts`, which renders its admin directory page.

### SCA-005 — `mysql2` 3.9.3 in `apps/trading`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-fpw7-j2hg-69v5](https://github.com/advisories/GHSA-fpw7-j2hg-69v5) · CVE-2024-21508 | Critical | Remote code execution through the `readCodeFor` function | 3.9.4 |
| [GHSA-4rch-2fh8-94vw](https://github.com/advisories/GHSA-4rch-2fh8-94vw) · CVE-2024-21511 | Critical | Arbitrary code injection | 3.9.7 |
| [GHSA-pmh2-wpjm-fj45](https://github.com/advisories/GHSA-pmh2-wpjm-fj45) · CVE-2024-21512 | High | Prototype pollution | 3.9.8 |
| [GHSA-49j4-86m8-q2jw](https://github.com/advisories/GHSA-49j4-86m8-q2jw) · CVE-2024-21509 | Medium | Prototype poisoning | 3.9.4 |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) · CVE-2024-21508 | High | Authentication plugin downgrade leaks plaintext credentials | 3.22.0 |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) · CVE-2024-21509 | Medium | Unbounded decompression allows a decompression-bomb denial of service | 3.23.1 |

The audit returns all six.

**Control:** none. Only one service uses MySQL.

**A question for the scanner.** TypeORM 1.1.3 declares `mysql2` as `^3.15.3`. The pin is below that range, so the manifest of `apps/trading` would request one version while the lockfile resolves another: a scanner has to report what is installed. The builder confirmed the pin at runtime: with 3.9.3 installed, `trading` starts and its integration tests pass against it.

### SCA-006 — `dot-prop` 4.1.0 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-ff7x-qrg7-qggm](https://github.com/advisories/GHSA-ff7x-qrg7-qggm) · CVE-2020-8116 | High | Prototype pollution | 4.2.1 |

The audit returns it.

**Control:** none. No other workspace uses `dot-prop`.

### SCA-007 — `node-serialize` 0.0.4 in `apps/accounts`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-q4v7-4rhw-9hqm](https://github.com/advisories/GHSA-q4v7-4rhw-9hqm) · CVE-2017-5941 | Critical | Code execution through an immediately invoked function expression | none |

The audit returns it.

**Control:** none. No corrected version exists.

### SCA-008 — `@nestjs/platform-fastify` 12.0.1 in `apps/trading`

This version of the adapter pins `fastify` 5.12.1, so it carries its own advisory and Fastify's.

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-9c5c-9qcx-q35q](https://github.com/advisories/GHSA-9c5c-9qcx-q35q) | High | `@nestjs/platform-fastify`: path-scoped middleware bypass through absolute-form request targets | 12.0.2 |
| [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm) · CVE-2026-84504 | High | `fastify`: request body replaced through an async validation result collision | 5.12.2 |
| [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7) · CVE-2026-76169 | High | `fastify`: authentication bypass through malformed URLs reaching encapsulated not-found handlers | 5.12.2 |
| [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h) · CVE-2026-84469 | High | `fastify`: request validation bypass through skipped `false` schemas | 5.12.2 |
| [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58) · CVE-2026-84428 | High | `fastify`: header validation bypass through incomplete schema case normalization | 5.12.2 |
| [GHSA-4mh8-r7rc-xpvc](https://github.com/advisories/GHSA-4mh8-r7rc-xpvc) · CVE-2026-92081 | Medium | `fastify`: denial of service through an unhandled exception on HTTP/2 trailer responses | 5.12.5 |

The audit returns all six: one for the adapter, five for `fastify` 5.12.1.

**Control:** `@nestjs/platform-fastify` 12.6.3, with `fastify` 5.12.8, in `apps/gateway` and `apps/accounts`. No advisory.

**Why `trading`.** It is a Fastify service that listens on HTTP/2, so the trailer advisory concerns a path that is really open. The builder confirmed that the 12.0.1 adapter interoperates with the 12.6.3 core every workspace runs: `trading` starts on it and its integration tests pass.

## How the pins were installed

Each pin was installed by its service's builder, exact, by command, with the snapshot written by `pnpm audit:update`: the three a scenario needs in the commit of that scenario, the others in a commit of their own.

Three of the eight are needed by the code of the services themselves, because no patched version makes the scenario exploitable:

| Pin | Scenario | Why the vulnerable version is needed |
| --- | --- | --- |
| `jsonwebtoken` 8.5.1 | AUTH-001 | From 9.0.0, `verify` refuses an HMAC algorithm when it is given a public key. The algorithm confusion only works on 8.5.1 |
| `node-serialize` 0.0.4 | DESER-001 | 0.0.4 is the only version there is |
| `dot-prop` 4.1.0 | PROTO-003 | From 4.2.1, `set` refuses `__proto__` in a path |

The other five are pinned for the scanner alone: `lodash` 4.17.20 in `accounts`, `node-fetch` 2.6.6 and `ejs` 3.1.6 in `notifications`, `mysql2` 3.9.3 and `@nestjs/platform-fastify` 12.0.1 in `trading`. No pin had to be replaced.

One thing the builder of `accounts` found on the way: the pinned CommonJS `lodash` breaks named ESM imports under plain Node, so `pnpm start` failed until the two callers took a default import, `import lodash from 'lodash'`, and call `lodash.trimEnd`.

## Reachability

A dependency scanner reports a vulnerable version whether or not the application calls the affected function. The lab records which it is, so that a scanner's reachability analysis can be checked too: a runtime test wherever the answer is "reachable", and a reading of the code where it is not.

| Pin | Reachability | Confirmed in |
| --- | --- | --- |
| `jsonwebtoken` 8.5.1 | Reachable: the legacy guard calls `verify`, and AUTH-001's token verifies through it | `apps/accounts/test/scenarios/auth.int-spec.ts`, `AUTH-001` |
| `lodash` 4.17.20 | Partly: the two callers call `trimEnd` alone, which the denial-of-service advisory names; `_.template` is never called | A reading of `apps/accounts/src/users/users.resolver.ts` and `apps/accounts/src/users/users.controller.ts`; no test of its own |
| `node-fetch` 2.6.6 | Reachable: the unguarded delivery follows a redirect with its headers | `apps/notifications/test/pins.int-spec.ts`: a 307 is followed with the signature header carried |
| `ejs` 3.1.6 | The library is reached, the advisory is not: it renders the announcement page, and CVE-2022-29078 needs caller-controlled options, which are fixed in code | `apps/notifications/test/pins.int-spec.ts`: it renders the page |
| `mysql2` 3.9.3 | The library is reached by every query of `trading`; the advisories' own paths are not exercised | No test of its own: every integration test of `apps/trading/test/` runs its queries through it |
| `dot-prop` 4.1.0 | Reachable: a caller-supplied path reaches `set` | `apps/notifications/test/pins.int-spec.ts`, and `apps/notifications/test/scenarios/proto.int-spec.ts`, `PROTO-003` |
| `node-serialize` 0.0.4 | Reachable: a cookie reaches `unserialize` | `apps/accounts/test/scenarios/auth.int-spec.ts`, `DESER-001` |
| `@nestjs/platform-fastify` 12.0.1 | The adapter is reached by every request to `trading`; the advisories' own paths (path-scoped middleware, the trailer response) are not exercised | No test of its own: every integration test of `apps/trading/test/` runs through the adapter |

`apps/notifications/test/pins.int-spec.ts` reads each version from the service's own `node_modules`, so the test fails if a pin moves. No other service has a pins file: for `accounts` the reachability of its pins is proven by the scenarios that need them, and for `trading` there is no test to write, since the advisories' paths are not taken.

## Candidates if a pin has to be replaced

None was needed. The candidates stand as a record:

| Candidate | Version | Advisories | Note |
| --- | --- | --- | --- |
| `qs` | 6.5.3 | [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p) · CVE-2025-15284, medium (array-limit bypass, memory exhaustion; fixed 6.14.1); [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) · CVE-2026-82417, medium (denial of service through attacker-controlled `isBuffer`; fixed 6.16.0) | Suits a nested query-string parser |
| `xlsx` | 0.18.5 | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) · CVE-2023-30533, high (prototype pollution); [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) · CVE-2024-22363, high (regular expression denial of service) | No corrected version on npm |
| `crypto-js` | 4.0.0 | [GHSA-xwcq-pm8m-c4vf](https://github.com/advisories/GHSA-xwcq-pm8m-c4vf) · CVE-2023-46233, critical (PBKDF2 far weaker than specified; fixed 4.2.0) | Suits a key derived from a short secret |

## Considered and left out

| Package | Why not |
| --- | --- |
| `express` 5.3.0, which the Express adapter pins | No advisory. Express is in the lab for adapter coverage, not as a target |
| `js-yaml` 3.13.1 | Five advisories at that version (CVE-2025-64718, CVE-2026-53550, CVE-2026-59869, CVE-2026-59870, CVE-2026-84375): a constant flow |
| `@apollo/gateway` 2.13.1 | Carries CVE-2026-32621, but depends on `@apollo/server-gateway-interface` `^1.1.0`, which does not match the `^2.0.0` that Apollo Server 5 expects |
| `typeorm` 0.3.28 | Two advisories, but its MongoDB peer range stops at `mongodb` 6, and the lab uses 7 |
| `bcrypt` before 5.0.0 | A native module with an install script |
| `axios`, `handlebars` | A constant flow of new advisories |

## Why the snapshot will change

New advisories are published for old versions. `pnpm audit:update` adds them without complaint. It refuses to remove one unless it is retired by name, so a finding can never disappear from the answer key unnoticed.
