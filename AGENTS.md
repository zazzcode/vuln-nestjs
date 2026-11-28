# Agent instructions

## Repository facts

- **What this is:** VCX (Vulnerable Crypto Exchange), a deliberately vulnerable NestJS application, built to test vulnerability scanners. The flaws are the product.
- **Docs root:** `.zazz` (repo-relative). Documentation for readers of the lab is in `docs/`.
- **Documentation model:** committed Markdown, reviewed through pull requests. Specifications are committed under `.zazz/specifications/`.
- **Work tracker:** none. The build order and its state are in [`.zazz/project/implementation-plan.md`](.zazz/project/implementation-plan.md). The pull request is the review record.
- **Branch policy:** one branch per deliverable, `phase-<n>-<slug>`, from its base; one pull request; opened as a draft with the deliverable's specification as its first commit. Commit and push to the feature branch only. Never commit to the base branch directly. A pull request is reviewed against its base.
- **Shared-file coordination:** each sub-agent writes only inside what is its own: its service directory (`apps/<service>/`), its folder of the API collections (`postman/<service>/`), its documentation modules under `docs/vulnerabilities/`, and its deliverable specification under `.zazz/specifications/`. Everything else shared belongs to the lead agent: `libs/`, `catalog/`, `tests/`, the Postman environment, `scripts/`, the root configuration, this file. A sub-agent makes two shared changes without asking, each by running a command and never by editing a file: `pnpm install`, after adding a dependency its specification names, which changes `pnpm-lock.yaml`, and `pnpm audit:update`, which rewrites `tests/expected-audit.json`. For anything else, it stops and asks.
- **Operating model:** the application is a sample. It is started, preloaded with fake data, exercised, and shut down. Nothing persists.

## Read only what applies

1. Read this file before changing anything.
2. To build a service: its [service specification](.zazz/project/services/README.md) is the contract. Then the step it belongs to in the [implementation plan](.zazz/project/implementation-plan.md), and the sections of the [architecture](.zazz/architecture/README.md) it depends on.
3. To add a scenario: the [scenario catalogue](.zazz/project/scenario-catalog.md), then [how a deliberate flaw is added](.zazz/architecture/security-model.md#5-how-a-deliberate-flaw-is-added) and the [test pattern](.zazz/architecture/testing-strategy.md#3-scenario-tests-in-both-directions).
4. To write a deliverable specification: the `spec-builder` skill in [`.agents/skills/`](.agents/skills/README.md). Once it is approved, `spec-driven` says how the work is run and recorded. To open or update a pull request: `pr-builder`. To review one: `pr-review`.
5. Do not preload the whole of `.zazz/` for a small change.

## Invariants

Violating any of these is a bad change, however green the tests.

1. **Never "fix" a vulnerable operation.** A test that proves a flaw stopped being exploitable is a regression: restore the flaw, do not weaken the test.
2. **Never upgrade or remove a vulnerable dependency pin.** Every advisory in `tests/expected-audit.json` is a finding the dependency scanner must report.
3. **A protected counterpart is a scoped claim.** "This pattern defeats this flaw for identical input" — never "secure in general".
4. **Every vulnerable operation has a protected counterpart**, and the lab keeps about one and a half safe operations for every vulnerable one. Where the two disagree, the counterpart is built and the ratio gives way: the evidence for a scenario outranks the number. (Decided by the Project Owner on 2026-11-26 and 2026-11-27, in place of the two to one of ADR-008. See [ADR-013](.zazz/architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md). Each service specification records what it left out.)
5. **Safety rails stay.** Loopback only, fake data, harmless markers (`42`, `zazzles-lab-marker`), no real credentials or files, no telemetry.
6. **Services never call each other.** A flow that needs two services is two calls made by the client.
7. **Generated ground truth is never hand-edited.** Re-snapshot in the same commit as the change that justifies it.
8. **Sample-sized.** If a concern only matters for an application that stays up, it does not belong here. See [ADR-004](.zazz/architecture/decisions/ADR-004-ephemeral-stores.md).
9. **Never document a command that has not been run.**
10. **Names in code stay neutral.** Identifiers and paths describe the feature, not the flaw.

## Repository commands

All from the root. Each was last run on 2026-11-26, the `git config` line on 2026-11-27 and the `scenario:check` line on 2026-11-28.

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Installs exactly the lockfile. Refuses if a manifest changed without it. |
| `git config core.hooksPath .githooks` | Enables the pre-push hook, once per clone: lint, the format check and the unit tests must pass before a push leaves. |
| `pnpm build` | Builds every library and service into its `dist/`. |
| `pnpm start` | Builds what is missing, starts the lab, prints its addresses, stops everything on Ctrl-C. |
| `pnpm lint` | oxlint with type awareness, then every workspace's typecheck. Zero warnings is the baseline. It reads the built types of the libraries, so on a fresh checkout `pnpm build` comes first. |
| `pnpm format`, `pnpm format:check` | Prettier over the repository. |
| `pnpm test` | Unit tests: every workspace, then the root's own. |
| `pnpm test:int` | Each service's integration tests, one service at a time. Starts a database engine. |
| `pnpm test:e2e` | The whole lab as four processes. Uses ports 3000, 3101–3103 and the relays on 3201, 3202. |
| `pnpm test:api` | Every collection under `postman/`, each run under Newman against the whole lab. The same ports as `test:e2e`. |
| `pnpm scenario:check`, `pnpm scenario:update` | Compares the scenario ground truth with the catalogue, or rewrites it. The check fails when a registered file changed, when a catalogue entry points at a file that does not exist, or when a registered scenario has no request named after it under `postman/`. Never hand-edit `tests/expected-hashes.json` or `tests/expected-scanner-findings.json`. |
| `pnpm audit:check`, `pnpm audit:update` | Compares the production audit with `tests/expected-audit.json`, or rewrites it. An advisory leaves only by name: `pnpm audit:update --retire <id>`. |
| `pnpm audit:lab` | The raw production audit. A nonzero exit is the lab working, once it has its pins. |

Before a commit, run `pnpm lint`, `pnpm format:check` and whatever tests cover what you changed, and read each exit code. Four builders at once share the machine: a service's builder runs only that service's integration tests (`pnpm --filter @zazzles/exchange-<service> test:int`). The root `test:int`, `test:e2e` and `test:api` take every port of the lab; to run one of them anyway, move the lab with the start command's variables (`GATEWAY_PORT`, `ACCOUNTS_PORT`, `TRADING_PORT`, `NOTIFICATIONS_PORT`, `ACCOUNTS_RELAY_PORT`, `TRADING_RELAY_PORT`). While a builder runs database tests on the same machine, do not run those three: the end-to-end suite can hang, and the stop check compares the whole machine. CI is the evidence for them.

**Nothing red is pushed.** A pre-push hook, `.githooks/pre-push`, runs `pnpm lint` (oxlint with type awareness and every workspace's typecheck, test files included), `pnpm format:check` and `pnpm test` before a push leaves the clone, and refuses the push while any issue they report stands. Fix the issue first: `git push --no-verify` is not used in this repository. Enable the hook once per clone, because Git does not commit that setting: `git config core.hooksPath .githooks`. CI runs on every push of a branch that has a pull request, draft or not, and each red run is mail to the owner.

## Local artifacts and skills

- **Active artifacts:** `.zazz/ephemeral/` — run logs, handoffs, QA findings, scratch. Ignored by Git and never committed.
- **Completed specifications:** stay in `.zazz/specifications/`, with their change log and the link to the pull request.
- **Skills:** vendored in [`.agents/skills/`](.agents/skills/README.md): `spec-builder`, `spec-driven`, `pr-builder`, `pr-review`, `doc-check` and `handoff`. This repository has no `standards/` directory: when a skill asks for a standards index, answer "none adopted". Its conventions are in this file and in the architecture pages under `.zazz/architecture/`.

## Repo-specific rules

- NestJS 12 is ESM-only: relative imports end in `.js`, `__dirname` does not exist, and tests run on Vitest (`vi.fn()`, not `jest.fn()`).
- `gateway`, `accounts` and `trading` use the Fastify adapter. `notifications` uses the Express adapter. A test creates an application with the adapter its service uses.
- A service's tests start that service alone, with its own store. No other service runs.
- `accounts` and `trading` speak HTTP/2 in cleartext, which curl, Postman, Newman and Burp cannot send. The launcher opens an HTTP/1.1 relay in front of each (`accounts` on 3201, `trading` on 3202) that carries each request to the service over HTTP/2 and changes nothing in it. In a test, reach a service over HTTP/1.1 through `lab.http1Url(service)`; never open a relay of your own.
- NestJS Observe is not installed. If a scaffold or an upgrade adds it, remove it.
- Every listener binds `127.0.0.1`. Every step that adds a listener or a database engine proves that the lab stops cleanly.
