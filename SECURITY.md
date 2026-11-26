# Security policy

## What this repository is

A **deliberately vulnerable** NestJS application for testing SAST, SCA and DAST tools, with a documented set of expected findings. It is a sample: started, preloaded with fake data, exercised, and shut down. The weaknesses are intentional, and each one is shipped with a test that asserts it remains exploitable and, where meaningful, a protected counterpart that asserts the identical payload stays inert.

## Status

At the time of writing (Phase 0) the repository contains **planning and documentation only**. No application code exists, so nothing is exploitable yet. This policy describes what the later steps will add and the rules that apply from the first line of code.

## Scope of the intentional vulnerabilities

The authoritative list will be `catalog/catalog.json`, added by the scaffolding. The plan is in [`.zazz/project/scenario-catalog.md`](.zazz/project/scenario-catalog.md); each scenario's write-up will be in [`docs/vulnerabilities/`](docs/vulnerabilities/index.md).

- **Application flaws (SAST and DAST targets).** SQL and NoSQL injection, command and argument injection, template injection, unsafe deserialization, broken access control at object, function and property level, token verification, lockout, business logic including races, request forgery, path traversal, unrestricted upload, prototype pollution, stored and reflected cross-site scripting, and GraphQL-specific exposure.
- **Dependency vulnerabilities (SCA targets).** Eight libraries pinned to vulnerable versions, each in one service, listed in [`docs/vulnerabilities/dependencies.md`](docs/vulnerabilities/dependencies.md).
- **Negative controls.** Five sources that scanners should **not** report for the listed weakness. A report against one is a false positive.

Several scenarios execute code on the host that runs the lab: deserialization with `node-serialize`, `eval`, and command injection. From the step that builds the services on, anyone who can reach the lab's ports can run code on that machine.

## Operational constraints

- Run it only on a machine you control, in an isolated environment, and **stop it afterwards**. It is not meant to stay up.
- Every listener binds `127.0.0.1`. Nothing listens on another interface, ever.
- All data is synthetic and is loaded at every start. The databases are in memory or temporary: no persistence, no external database service. A reset or a restart restores the fake data.
- Credentials such as `admin-lab-only` exist only for the lab.
- Exploit documentation and tests use harmless markers only (`42`, `zazzles-lab-marker`) and loopback addresses only.
- Do not keep real credentials or sensitive files on a machine where untrusted people can reach the lab's ports.
- Never deploy it, expose it on a network, or point a scenario at a host you do not own.

## Guarding the ground truth

So the lab's expected findings cannot drift silently:

- `pnpm scenario:check` — every registered source file matches its committed hash (`tests/expected-hashes.json`), and the scanner expectations (`tests/expected-scanner-findings.json`) are in sync with the catalogue.
- `pnpm audit:check` — `pnpm audit --prod --json` matches the committed snapshot (`tests/expected-audit.json`).

Both arrive with the scaffolding. Both fail on drift and are re-snapshotted only after review, in the same change that justifies them. CI enforces this on every pull request.

## Reporting

- **Non-intentional vulnerabilities** — something exploitable that is not in the catalogue, or a flaw in a *protected counterpart*: please open an issue or contact the maintainer privately. Do not test beyond your own checkout.
- **Scanner behaviour** — false positives and false negatives against the catalogue are useful issues. Include the tool, its version and the scenario ID.
- **Do not** open issues asking to fix a scenario or to upgrade a pinned vulnerable dependency. Retiring either is a deliberate, documented change.
