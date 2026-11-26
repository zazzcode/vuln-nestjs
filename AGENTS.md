# Agent instructions

## Repository facts

- **What this is:** a deliberately vulnerable NestJS application, built to test vulnerability scanners. The flaws are the product.
- **Docs root:** `.zazz` (repo-relative). Documentation for readers of the lab is in `docs/`.
- **Documentation model:** committed Markdown, reviewed through pull requests. Specifications are committed under `.zazz/specifications/`.
- **Work tracker:** none. The build order and its state are in [`.zazz/project/implementation-plan.md`](.zazz/project/implementation-plan.md). The pull request is the review record.
- **Branch policy:** one branch per deliverable, `phase-<n>-<slug>`, from its base; one pull request; opened as a draft with the deliverable's specification as its first commit. Commit and push to the feature branch only. Never commit to the base branch directly.
- **Shared-file coordination:** each sub-agent writes only inside its own service directory (`apps/<service>/`). Everything shared belongs to the lead agent: `libs/`, `catalog/`, `tests/`, `postman/`, `scripts/`, the root configuration, this file. A sub-agent that needs a shared change stops and asks.
- **Operating model:** the application is a sample. It is started, preloaded with fake data, exercised, and shut down. Nothing persists.

## Read only what applies

1. Read this file before changing anything.
2. To build a service: its [service specification](.zazz/project/services/README.md) is the contract. Then the step it belongs to in the [implementation plan](.zazz/project/implementation-plan.md), and the sections of the [architecture](.zazz/architecture/README.md) it depends on.
3. To add a scenario: the [scenario catalogue](.zazz/project/scenario-catalog.md), then [how a deliberate flaw is added](.zazz/architecture/security-model.md#5-how-a-deliberate-flaw-is-added) and the [test pattern](.zazz/architecture/testing-strategy.md#3-scenario-tests-in-both-directions).
4. To write a deliverable specification: the `spec-builder` skill in [`.agents/skills/`](.agents/skills/README.md).
5. Do not preload the whole of `.zazz/` for a small change.

## Invariants

Violating any of these is a bad change, however green the tests.

1. **Never "fix" a vulnerable operation.** A test that proves a flaw stopped being exploitable is a regression: restore the flaw, do not weaken the test.
2. **Never upgrade or remove a vulnerable dependency pin.** Every advisory in `tests/expected-audit.json` is a finding the dependency scanner must report.
3. **A protected counterpart is a scoped claim.** "This pattern defeats this flaw for identical input" — never "secure in general".
4. **Every vulnerable operation has a protected counterpart**, and the lab keeps about two safe operations for every vulnerable one.
5. **Safety rails stay.** Loopback only, fake data, harmless markers (`42`, `zazzles-lab-marker`), no real credentials or files, no telemetry.
6. **Services never call each other.** A flow that needs two services is two calls made by the client.
7. **Generated ground truth is never hand-edited.** Re-snapshot in the same commit as the change that justifies it.
8. **Sample-sized.** If a concern only matters for an application that stays up, it does not belong here. See [ADR-004](.zazz/architecture/decisions/ADR-004-ephemeral-stores.md).
9. **Never document a command that has not been run.**
10. **Names in code stay neutral.** Identifiers and paths describe the feature, not the flaw.

## Repository commands

Nothing can run yet. Step 1, the scaffolding, adds the application and records the commands in `docs/setup-and-testing.md`; the planned names are in the [repository layout](.zazz/architecture/repository-layout.md#5-root-scripts). Until that file exists, a change to this repository is a change to documentation.

## Local artifacts and skills

- **Active artifacts:** `.zazz/ephemeral/` — run logs, handoffs, QA findings, scratch. Ignored by Git and never committed.
- **Completed specifications:** stay in `.zazz/specifications/`, with their change log and the link to the pull request.
- **Skills:** vendored in `.agents/skills/`: `spec-builder` and `handoff`, from [zazzcode/zazz-skills](https://github.com/zazzcode/zazz-skills). This repository has no `standards/` directory: when the `spec-builder` skill asks for a standards index, answer "none adopted".

## Repo-specific rules

- NestJS 12 is ESM-only: relative imports end in `.js`, `__dirname` does not exist, and tests run on Vitest (`vi.fn()`, not `jest.fn()`).
- `gateway`, `accounts` and `trading` use the Fastify adapter. `notifications` uses the Express adapter. A test creates an application with the adapter its service uses.
- A service's tests start that service alone, with its own store. No other service runs.
- NestJS Observe is not installed. If a scaffold or an upgrade adds it, remove it.
- Every listener binds `127.0.0.1`. Every step that adds a listener or a database engine proves that the lab stops cleanly.
