# Vulnerable dependencies (SCA)

**Status: planned.** No dependency is installed yet; the repository holds no application code until the scaffolding. This page lists the eight libraries that Step 4 will pin to vulnerable versions, with the advisory each version carries.

The versions and their advisories were checked on 2026-11-26 against the GitHub Advisory Database, through its API, and against the npm registry. After Step 4, `tests/expected-audit.json` is the complete answer. This page is its summary.

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

**Control:** `jsonwebtoken` 9.0.3, which `@nestjs/jwt` 12.0.5 brings into every other workspace. No advisory.

### SCA-002 — `lodash` 4.17.20 in `apps/accounts`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-35jh-r3h4-6jhm](https://github.com/advisories/GHSA-35jh-r3h4-6jhm) · CVE-2021-23337 | High | Command injection in `_.template` | 4.17.21 |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) · CVE-2026-4800 | High | Code injection through the `imports` key names of `_.template` | 4.18.0 |
| [GHSA-29mw-wpgm-hmr9](https://github.com/advisories/GHSA-29mw-wpgm-hmr9) · CVE-2020-28500 | Medium | Regular expression denial of service | 4.17.21 |
| [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) · CVE-2025-13465 | Medium | Prototype pollution in `_.unset`, `_.omit` and `_.pullAt` | 4.17.23 |
| [GHSA-8p5q-j9m2-g8wr](https://github.com/advisories/GHSA-8p5q-j9m2-g8wr) · CVE-2021-41720 | Low | Withdrawn advisory | none |

**Control:** `lodash` 4.18.1 in `apps/trading`. No advisory.

### SCA-003 — `node-fetch` 2.6.6 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-r683-j2x4-v87g](https://github.com/advisories/GHSA-r683-j2x4-v87g) · CVE-2022-0235 | High | Forwards secure headers to untrusted sites on redirect | 2.6.7 |

**Control:** `node-fetch` 2.7.0 in `apps/accounts`. No advisory.

### SCA-004 — `ejs` 3.1.6 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-phwq-j96m-2c2q](https://github.com/advisories/GHSA-phwq-j96m-2c2q) · CVE-2022-29078 | Critical | Server-side template injection | 3.1.7 |
| [GHSA-ghr5-ch3p-vcr6](https://github.com/advisories/GHSA-ghr5-ch3p-vcr6) · CVE-2024-33883 | Medium | Lacks certain pollution protection | 3.1.10 |

**Control:** `ejs` 3.1.10 in `apps/accounts`, which renders its admin directory page.

### SCA-005 — `mysql2` 3.9.3 in `apps/trading`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-fpw7-j2hg-69v5](https://github.com/advisories/GHSA-fpw7-j2hg-69v5) · CVE-2024-21508 | Critical | Remote code execution through the `readCodeFor` function | 3.9.4 |
| [GHSA-4rch-2fh8-94vw](https://github.com/advisories/GHSA-4rch-2fh8-94vw) · CVE-2024-21511 | Critical | Arbitrary code injection | 3.9.7 |
| [GHSA-pmh2-wpjm-fj45](https://github.com/advisories/GHSA-pmh2-wpjm-fj45) · CVE-2024-21512 | High | Prototype pollution | 3.9.8 |
| [GHSA-49j4-86m8-q2jw](https://github.com/advisories/GHSA-49j4-86m8-q2jw) · CVE-2024-21509 | Medium | Prototype poisoning | 3.9.4 |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) | High | Authentication plugin downgrade leaks plaintext credentials | 3.22.0 |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) | Medium | Unbounded decompression allows a decompression-bomb denial of service | 3.23.1 |

**Control:** none. Only one service uses MySQL.

**A question for the scanner.** TypeORM 1.1.3 declares `mysql2` as `^3.15.3`. The pin is below that range, so the manifest of `apps/trading` would request one version while the lockfile resolves another. A scanner has to report what is installed. Step 4 first confirms that TypeORM works with 3.9.3 at runtime; if it does not, the pin is replaced by a candidate below.

### SCA-006 — `dot-prop` 4.1.0 in `apps/notifications`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-ff7x-qrg7-qggm](https://github.com/advisories/GHSA-ff7x-qrg7-qggm) · CVE-2020-8116 | High | Prototype pollution | 4.2.1 |

**Control:** `dot-prop` 4.2.1 in `apps/accounts`. No advisory.

### SCA-007 — `node-serialize` 0.0.4 in `apps/accounts`

| Advisory | Severity | What it is | Fixed in |
| --- | --- | --- | --- |
| [GHSA-q4v7-4rhw-9hqm](https://github.com/advisories/GHSA-q4v7-4rhw-9hqm) · CVE-2017-5941 | Critical | Code execution through an immediately invoked function expression | none |

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

**Control:** `@nestjs/platform-fastify` 12.6.3, with `fastify` 5.12.8, in `apps/gateway` and `apps/accounts`. No advisory.

**Why `trading`.** It is a Fastify service that listens on HTTP/2, so the trailer advisory concerns a path that is really open. Step 4 confirms that the 12.0.1 adapter works with the 12.6.3 core it has to interoperate with. If it does not, the pin is dropped and the remaining seven stand.

## When the pins are installed

Three of the eight are needed by the code of the services themselves, because no patched version makes the scenario exploitable. They are installed when their service is built, in Step 2 of the build order:

| Pin | Scenario | Why the vulnerable version is needed |
| --- | --- | --- |
| `jsonwebtoken` 8.5.1 | AUTH-001 | From 9.0.0, `verify` refuses an HMAC algorithm when it is given a public key. The algorithm confusion only works on 8.5.1 |
| `node-serialize` 0.0.4 | DESER-001 | 0.0.4 is the only version there is |
| `dot-prop` 4.1.0 | PROTO-003 | From 4.2.1, `set` refuses `__proto__` in a path |

The other five arrive in Step 4, which also records all eight, with the audit snapshot and the reachability statements.

## Reachability

A dependency scanner reports a vulnerable version whether or not the application calls the affected function. The lab records which it is, so that a scanner's reachability analysis can be checked too. Step 4 writes one statement per pin, and a runtime test wherever the answer is "reachable".

| Pin | Expected at the time of writing | Confirmed in |
| --- | --- | --- |
| `jsonwebtoken` 8.5.1 | Reachable: the sign-in verification path calls `verify` | Step 4 |
| `lodash` 4.17.20 | Partly: input normalization calls `trimEnd` (the denial-of-service advisory). `_.template` is never called | Step 4 |
| `node-fetch` 2.6.6 | Reachable: the webhook client follows a redirect with its headers | Step 4 |
| `ejs` 3.1.6 | Not reachable: the template options are fixed in code, and CVE-2022-29078 needs caller-controlled options | Step 4 |
| `mysql2` 3.9.3 | Not reachable through normal query execution | Step 4 |
| `dot-prop` 4.1.0 | Reachable: a caller-supplied path reaches `set` | Step 4 |
| `node-serialize` 0.0.4 | Reachable: a cookie reaches `unserialize` | Step 4 |
| `@nestjs/platform-fastify` 12.0.1 | Partly: the HTTP/2 trailer advisory is reachable on the listener; the middleware bypass needs path-scoped middleware | Step 4 |

## Candidates if a pin has to be replaced

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
