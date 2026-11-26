# Agent instructions

## Repository facts

- **What this is:** a deliberately vulnerable NestJS application, built to test vulnerability scanners. The flaws are the product.
- **Docs root:** `.zazz` (repo-relative). Documentation for readers of the lab is in `docs/`.
- **Documentation model:** committed Markdown, reviewed through pull requests. Specifications are committed under `.zazz/specifications/`.
- **Work tracker:** none. The phases and their status are in [`.zazz/project/project-plan.md`](.zazz/project/project-plan.md). The pull request is the review record.
- **Branch policy:** one branch per phase, `phase-<n>-<slug>`, from `main`; one pull request; opened as a draft with the phase's specification as its first commit. Commit and push to the feature branch only. Never commit to `main`.
- **Shared-file coordination:** serialize edits to `catalog/catalog.json`, `tests/expected-*.json`, `.zazz/project/scenario-catalog.md` and `.zazz/project/project-plan.md`. One agent edits each at a time.
- **Operating model:** the application is a sample. It is started, preloaded with fake data, exercised, and shut down. Nothing persists.

## Read only what applies

1. Read this file before changing anything.
2. To build or change the lab: [project plan](.zazz/project/project-plan.md) for the phase, then the [architecture](.zazz/architecture/README.md) sections the phase depends on, then the phase's [specification](.zazz/specifications/README.md).
3. To add a scenario: the [scenario catalogue](.zazz/project/scenario-catalog.md), then [how a deliberate flaw is added](.zazz/architecture/security-model.md#5-how-a-deliberate-flaw-is-added) and the [test pattern](.zazz/architecture/testing-strategy.md#3-scenario-tests-in-both-directions). From Phase 5 on, also `docs/adding-scenarios.md`.
4. Do not preload the whole of `.zazz/` for a small change.

## Invariants

Violating any of these is a bad change, however green the tests.

1. **Never "fix" a vulnerable operation.** A test that proves a flaw stopped being exploitable is a regression: restore the flaw, do not weaken the test.
2. **Never upgrade or remove a vulnerable dependency pin.** Every advisory in `tests/expected-audit.json` is a finding the dependency scanner must report. Retiring a pin is its own change, which names the advisory.
3. **A protected counterpart is a scoped claim.** "This pattern defeats this flaw for identical input" — never "secure in general". Validation complements parameterization; it never replaces it.
4. **Safety rails stay.** Loopback only, fake data, harmless markers (`42`, `zazzles-lab-marker`), no real credentials or files, no telemetry.
5. **Generated ground truth is never hand-edited.** Re-snapshot in the same commit as the change that justifies it, and say why in the commit message. A snapshot update with no source change is rejected in review.
6. **Sample-sized.** If a concern only matters for an application that stays up — retries, reconciliation, caches, brokers, tracing — it does not belong here. See [ADR-004](.zazz/architecture/decisions/ADR-004-ephemeral-stores.md).
7. **Never document a command that has not been run.**
8. **Names in code stay neutral.** Identifiers and paths describe the feature, not the flaw. The catalogue holds the answers.

## Repository commands

Nothing can be run yet. Phase 1 adds the application and records the commands in `docs/setup-and-testing.md`; the planned names are in the [repository layout](.zazz/architecture/repository-layout.md#5-root-scripts). Until that file exists, a change to this repository is a change to documentation.

## Local artifacts and skills

- **Active artifacts:** `.zazz/ephemeral/` — run logs, QA findings, handoffs, scratch. Ignored by Git and never committed.
- **Completed specifications:** stay in `.zazz/specifications/`, with their change log and the link to the pull request.
- **Skills:** none are vendored. The shared Zazz skills are in [zazzcode/zazz-skills](https://github.com/zazzcode/zazz-skills). Use the one that matches the task.

## Repo-specific rules

- NestJS 12 is ESM-only: relative imports end in `.js`, `__dirname` does not exist, and tests run on Vitest (`vi.fn()`, not `jest.fn()`).
- The gateway, `accounts` and `trading` use the Fastify adapter. `notifications` uses the Express adapter. A test creates an application with the adapter its service uses.
- NestJS Observe is not installed. If a scaffold or an upgrade adds it, remove it.
- Every listener binds `127.0.0.1`. Every phase that adds a listener or a database engine proves that the lab stops cleanly.
