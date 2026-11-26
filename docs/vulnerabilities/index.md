# Vulnerabilities

**Status: designed, not built.** No scenario has been shipped. This index describes what the lab will contain, how each scenario will be documented, and how to use the catalogue to score a scanner. As the services are built, this page becomes the table of every scenario with a link to its write-up.

Every scenario is designed in the [service specifications](../../.zazz/project/services/README.md): the vulnerable operation, its sink, and its protected counterparts. The list of IDs is in the [scenario catalogue](../../.zazz/project/scenario-catalog.md). This page does not repeat either.

## What a scenario is

One deliberate weakness. Each has:

| Part | What it is |
| --- | --- |
| An ID | `<FAMILY>-<number>`, such as `SQL-003`. Permanent once shipped |
| A vulnerable operation | A GraphQL field, a REST endpoint, or a process-wide setting |
| A protected counterpart | An operation that receives the identical payload and keeps it inert. Where a second technique exists, a second counterpart |
| Documentation | The flaw explained, a reproduction with curl, Postman and Burp, the counterparts compared, the tests |
| Tests | One proving the exploit, one proving each counterpart is inert, and one request in the Postman collection |
| A catalogue entry | In `catalog/catalog.json`, the source of truth from which the ground truth is generated |

## Families

| Family | Covers | OWASP Top 10 | OWASP API | Designed |
| --- | --- | --- | --- | --- |
| `AUTH` | Authentication and sessions | A02, A07 | API2 | 5 |
| `CRYPTO` | Weak hashing, weak randomness, hard-coded secrets | A02 | — | 3 |
| `ACCESS` | Authorization: object, function and property level; trusted headers | A01 | API1, API3, API5, API10 | 10 |
| `SQL` | SQL injection through TypeORM and MySQL | A03 | API3 | 4 |
| `MONGO` | NoSQL operator injection | A03 | API3 | 6 |
| `PROTO` | Prototype pollution | A08 | — | 3 |
| `XSS` | Stored and reflected cross-site scripting | A03 | — | 4 |
| `FS` | Path traversal, unrestricted upload | A01, A04 | — | 4 |
| `SSRF` | Server-side request forgery | A10 | API7 | 3 |
| `OS` | Command and argument injection | A03 | — | 2 |
| `DESER` | Unsafe deserialization, `eval`, template injection | A08, A03 | — | 3 |
| `LOGIC` | Business logic: negative amounts, races, precision | A04 | API6 | 5 |
| `GQL` | GraphQL itself | A01, A05, A07 | API1, API3, API4, API6, API8, API9 | 7 |
| `CONFIG` | Security misconfiguration | A05 | API8, API9 | 4 |
| `COOKIE` | Cookie attributes and CSRF | A05 | — | 3 |
| `REDIR` | Open redirect | A01 | — | 1 |
| `INJECT` | Spreadsheet-formula and log injection | A03 | — | 2 |
| `RE` | Regular expression denial of service | A03 | — | 1 |
| `RES` | Unrestricted resource consumption | A05 | API4 | 2 |
| `INFO` | Information exposure through logs and errors | A09, A05 | API8 | 2 |
| `SCA` | Vulnerable dependency versions | A06 | — | 8 |

**74 weaknesses in application code, on 62 vulnerable operations, and 8 vulnerable dependency pins.** Every category of both OWASP lists is covered, and so are the four the Project Owner named: SQL injection, NoSQL injection, prototype pollution and stored XSS.

## Safe and vulnerable

The lab keeps about two safe operations for every vulnerable one: 118 safe, 62 vulnerable. The safe operations are what a scanner must leave alone. A report against one, for the weakness it is the counterpart of, is a false positive.

| Service | Vulnerable operations | Safe operations |
| --- | --- | --- |
| accounts | 28 | 41 |
| trading | 17 | 35 |
| notifications | 9 | 29 |
| gateway | 8 | 13 |

## How each scenario will be documented

One module per family, `docs/vulnerabilities/<family>.md`, with the same linkable sections for every scenario. The anchors are stable, so an agent or a person can deep-link without reading around them.

| Section | Anchor | Holds |
| --- | --- | --- |
| Scenario | `#<id>` | The heading |
| Agent reference | `#<id>-agent` | A compact, self-contained block: source path, operation, sink, flow, counterpart paths, tests, the expected finding |
| Student guide | `#<id>-student` | The flaw explained: the mechanism, the code, why it works |
| Exploit lab | `#<id>-exploit` | Reproduction with curl, Postman and Burp, and the observation that proves exploitation |
| Vulnerable and protected | `#<id>-safe` | The operations side by side, and *why* each counterpart works |
| Tests | `#<id>-tests` | The automated coverage of both directions |

Every reproduction is written only after it has been run. Every exploit uses a harmless marker and a loopback address.

## Vulnerable dependencies

The eight libraries that will be pinned to vulnerable versions, with the advisory each one carries, are in [dependencies.md](dependencies.md).

## Scoring a scanner

Two files let a report be scored without reading the repository. Both arrive with the scaffolding and fill in as the services are built:

| File | Use |
| --- | --- |
| `tests/expected-scanner-findings.json` | One row per source file. `expectedFinding: true` must be flagged for the listed CWE: a miss is a false negative. `expectedFinding: false` is a protected counterpart: a report for the listed CWE is a false positive |
| `tests/expected-audit.json` | The dependency advisories, per workspace. A missing one is a false negative; one attributed to the wrong workspace is wrong |

Both are generated from `catalog/catalog.json` and from `pnpm audit`, and both are checked in CI.

## Safety

The lab runs on `127.0.0.1` only, with fake data, and is meant to be stopped after use. Several scenarios execute code on the machine that runs it. See [SECURITY.md](../../SECURITY.md).
