# Vulnerabilities

**Status: planned.** No scenario has been shipped. This index describes what the lab will contain, how each scenario will be documented, and how to use the catalogue to score a scanner. As scenarios ship, from Phase 5 on, this page becomes the table of every scenario with a link to its write-up.

The itemized plan — every scenario with its service, its surface, its CWE and the phase that ships it — is in [`.zazz/project/scenario-catalog.md`](../../.zazz/project/scenario-catalog.md). This page does not repeat it.

## What a scenario is

One deliberate weakness. Each has:

| Part | What it is |
| --- | --- |
| An ID | `<FAMILY>-<number>`, such as `SQL-003`. Permanent once shipped |
| A vulnerable operation | A GraphQL field or a REST handler, in its own file |
| A protected counterpart | Where meaningful: an operation that receives the identical payload and keeps it inert |
| Documentation | The flaw explained, a reproduction with curl, Postman and Burp, the counterpart compared, the tests |
| Tests | One proving the exploit, one proving the counterpart is inert, and one request in the Postman collection |
| A catalogue entry | In `catalog/catalog.json`, the source of truth from which the ground truth is generated |

## Families

| Family | Covers | OWASP Top 10 | OWASP API | Planned |
| --- | --- | --- | --- | --- |
| `AUTH` | Authentication and sessions | A02, A07 | API2 | 5 |
| `ACCESS` | Authorization: object, function, property level; trusted headers | A01 | API1, API3, API5, API10 | 6 |
| `SQL` | SQL injection through TypeORM and MySQL | A03 | API3 | 4 |
| `MONGO` | NoSQL operator injection | A03 | API3 | 6 |
| `OS` | Command and argument injection | A03 | — | 2 |
| `DESER` | Unsafe deserialization, `eval`, template injection | A03, A08 | — | 3 |
| `FS` | Path traversal, unrestricted upload | A01, A04 | — | 3 |
| `SSRF` | Server-side request forgery | A10 | API7 | 3 |
| `REDIR` | Open redirect | A01 | — | 1 |
| `COOKIE` | Cookie attributes, CSRF | A05, A07 | — | 3 |
| `INJECT` | HTML, header and spreadsheet-formula injection | A03 | — | 4 |
| `LOGIC` | Business logic: negative amounts, races, precision | A04 | API6 | 5 |
| `GQL` | GraphQL-specific exposure and resource issues | A01, A05 | API1, API3, API4, API6, API8, API9 | 7 |
| `CONFIG` | Security misconfiguration at the gateway | A05 | API8, API9 | 4 |
| `CRYPTO` | Weak hashing, weak randomness, hard-coded secrets | A02 | — | 3 |
| `RE` | Regular expression denial of service | A03 | — | 1 |
| `RES` | Unrestricted resource consumption | A05 | API4 | 2 |
| `INFO` | Information exposure through logs and errors | A07, A09 | API8 | 2 |
| `SCA` | Vulnerable dependency versions | A06 | — | 8 |
| `DEMO` | Negative controls. No finding expected | — | — | 5 |

Every category of both OWASP lists is covered.

## How each scenario will be documented

One module per family, `docs/vulnerabilities/<family>.md`, with the same linkable sections for every scenario. The anchors are stable, so an agent or a person can deep-link without reading around them.

| Section | Anchor | Holds |
| --- | --- | --- |
| Scenario | `#<id>` | The heading |
| Agent reference | `#<id>-agent` | A compact, self-contained block: source path, operation, sink, flow, counterpart path, tests, the expected finding |
| Student guide | `#<id>-student` | The flaw explained: the mechanism, the code, why it works |
| Exploit lab | `#<id>-exploit` | Reproduction with curl, Postman and Burp, and the observation that proves exploitation |
| Vulnerable and protected | `#<id>-safe` | The two operations side by side, and *why* the counterpart works |
| Tests | `#<id>-tests` | The automated coverage of both directions |

Every reproduction is written only after it has been run. Every exploit uses a harmless marker and a loopback address.

## Vulnerable dependencies

The eight libraries that will be pinned to vulnerable versions, with the advisory each one carries, are in [dependencies.md](dependencies.md).

## Scoring a scanner

From Phase 5 on, two files let a report be scored without reading the repository:

| File | Use |
| --- | --- |
| `tests/expected-scanner-findings.json` | One row per source file. `expectedFinding: true` must be flagged for the listed CWE: a miss is a false negative. `expectedFinding: false` is a negative control: a report for the listed CWE is a false positive |
| `tests/expected-audit.json` | The dependency advisories, per workspace. A missing one is a false negative; one attributed to the wrong workspace is wrong |

Both are generated from `catalog/catalog.json` and from `pnpm audit`, and both are checked in CI.

## Safety

The lab runs on `127.0.0.1` only, with fake data, and is meant to be stopped after use. Several scenarios execute code on the machine that runs it. See [SECURITY.md](../../SECURITY.md).
