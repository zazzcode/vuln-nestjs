# The cleanup after Step 2 — Deliverable Specification

**Worktree / branch:** `vuln-nestjs-wt/cleanup` / `phase-2-cleanup`
**Feature:** VCX, the deliberately vulnerable NestJS lab · **Milestone:** after Step 2, beside Step 3
**Deliverable:** what the build of the four services left untrue or unused: documents that describe the scaffolding as it was, contracts whose counts predate a decision, scaffold dependencies nothing imports, and two rules the builder's definition does not carry
**Project Owner / Deliverable Owner:** the Project Owner · **Drafted:** 2026-11-28
**Delivery topology:** single-deliverable branch · **Review artifact:** one draft pull request to `main`
**Approved review shape:** one PR
**Decomposition rationale:** one small pull request for every loose end the handoff of 2026-11-27 listed under its open issue 4, because each is too small for a pull request of its own and none belongs to a service. The two items that need the whole lab re-run from a clean clone — the setup page's counts and outputs — are left to the release step, which produces them
**Integration branch:** `main` · **Merge policy:** PR review required — the agent commits and pushes this branch only. The Project Owner merges, after #7 and #6
**Run log:** `.zazz/ephemeral/003b-cleanup-run-log.md` in the worktree (ignored by Git) · **Execution tracking:** none. The pull request is the record
**Implementation coordination:** one Contributor Agent (`service-builder`), alone in its worktree; the Lead Agent gives it the machine for the steps that take a port and runs the gate afterwards · **Companion skills:** `doc-check`, `pr-builder`
**Standards:** none adopted. `AGENTS.md` stands in for the index.

**Greenlight.** The Project Owner's instruction of 2026-11-28 to complete the implementation, testing and documentation of VCX. The handoff of 2026-11-27 lists every item of this specification under its open issue 4, for "a small pull request on a branch from `main`".

**The base of the branch.** Cut from `abead16`, a local merge of the tips of #6 (`e5db3dd`) and #7 (`9992636`), which is the tree `main` holds once both are merged. Until `main` is merged into this branch, this pull request's diff shows their files, or one sibling's: their two tips are both merge bases of this branch and of `main` (measured on 2026-11-28). The scope of this deliverable is `git diff abead16..HEAD --name-only` until that merge, which the Lead Agent makes as soon as #7 and #6 are merged; from then on `git diff origin/main...HEAD --name-only`. The two documentation commits #6 gained afterwards (`af1b003`, `f386f26`) come in with `main` at the merge; this deliverable does not touch the lines they changed.

---

## 0. Capability

After it: every scaffold dependency nothing imports is gone from the manifests, and no vulnerable pin and no required peer moved; the contracts of accounts, trading and the gateway count their operations as built and record what they left out, as the notifications contract already does and invariant 4 asks; each contract names the dependency versions its service is built with; a lint rule refuses a subgraph's importing the HTTP client, which success criterion SC10 of the project plan promises; the builder's definition carries the two run-log rules every brief had to repeat; the foundation's specification has the change log of its build; `repository-layout.md` describes the tree as it is; and the descriptions of #2 and #5 say what was merged unfinished and which pull request finished it. **No code changes beyond the lint configuration; no flaw is touched.**

---

## 1. Required reading

- [AGENTS.md](../../AGENTS.md): the invariants — 2, 4 and 9 above all — the shared-file rule, the commands.
- [ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md): the ratio, and that each service specification records what it left out.
- [notifications.md](../project/services/notifications.md): its lines "**Counts.**" and "**Dependency versions this service is built with.**", as corrected on 2026-11-27 — the model for the three other contracts.
- The four deliverable specifications of Step 2, their decision on safe operations (`002a` D-2, `002b`, `002c` D-2, `002d` D-8), and their section 13 change logs: what each service left out and why.
- [001-foundation.md](001-foundation.md) and its run log (`.zazz/ephemeral/001-foundation-run-log.md` in the main checkout): for the change log.
- [repository-layout.md](../architecture/repository-layout.md), beside the tree.
- [project-plan.md](../project/project-plan.md): SC10, section 8 (the pull request workflow).

---

## 2. Invariants

- **INVARIANT 2 — Never upgrade or remove a vulnerable dependency pin.** No pin is touched. A dependency whose removal would retire an advisory from `tests/expected-audit.json` stays: before any removal, the snapshot is searched for the package's name.
- **INVARIANT 4 — Every vulnerable operation has a protected counterpart**, and each service specification records what it left out.
- **INVARIANT 7 — Generated ground truth is never hand-edited.** `tests/expected-audit.json` is rewritten, if at all, by `pnpm audit:update` alone; the two scenario snapshots are not touched.
- **INVARIANT 9 — Never document a command that has not been run.** A count written into a contract is counted from the code; a line quoted from a run log is quoted as it stands.
- **INVARIANT 10 — Names in code stay neutral.**

---

## 3. Scope

### Approved review shape

One pull request.

### Strict scope constraint

Every file this deliverable changes is `apps/*/package.json`, `pnpm-lock.yaml`, `tests/expected-audit.json` (by command only), `libs/testing/src/graphql.ts`, `libs/testing/src/graphql.spec.ts`, `.oxlintrc.json`, `.zcode/agents/service-builder.md`, `.zazz/specifications/001-foundation.md`, `.zazz/specifications/003b-cleanup.md`, `.zazz/specifications/README.md`, `.zazz/architecture/repository-layout.md`, `.zazz/project/services/{accounts,trading,gateway}.md`, or — outside the repository — the description of pull request #2 and of #5. Anything else stops the work.

### In scope

| Path | New / modified | Reason |
| --- | --- | --- |
| `apps/accounts/package.json`, `apps/trading/package.json`, `apps/notifications/package.json`, `apps/gateway/package.json`, `pnpm-lock.yaml` | modified | The scaffold dependencies nothing imports, removed (section 6, AC1); `@nestjs/jwt` of the gateway to `devDependencies`, where its one use is |
| `tests/expected-audit.json` | by command only | Unchanged, expected: no advisory names a package removed. Changed only if the registry moved, and then by `pnpm audit:update` with the reason in the commit |
| `.oxlintrc.json` | modified | SC10's rule: a subgraph does not import `@zazzles/exchange-http2`, nor another service's package (AC3) |
| `.zcode/agents/service-builder.md` | modified | The two run-log rules (AC4) |
| `libs/testing/src/graphql.ts`, `libs/testing/src/graphql.spec.ts` | modified, new | `graphql()` returns the HTTP status its type declares, with the test that fails before (D-4, AC11) |
| `.zazz/project/services/accounts.md`, `trading.md`, `gateway.md` | modified | Their counts as built and what they left out; their dependency versions as built (AC5) |
| `.zazz/specifications/001-foundation.md` | modified | The change log of the build (AC6) |
| `.zazz/architecture/repository-layout.md` | modified | The tree as it is (AC7) |
| `.zazz/specifications/003b-cleanup.md`, `.zazz/specifications/README.md` | new, modified | This file; its row |
| The descriptions of #2 and #5, by `gh pr edit` | modified | What was merged unfinished, and what finished it (AC8) |

### Out of scope

- `docs/setup-and-testing.md`, `README.md`, `docs/*.md`: the release step, which runs every command from a clean clone and writes what it printed.
- `docs/vulnerabilities/**` and `dependencies.md`: the documentation pass (#9).
- Every file of a service's code or tests, `libs/`, `scripts/`, `catalog/`, the two scenario snapshots, `postman/`.
- The package scope `@zazzles/exchange-*`: open with the Project Owner (open issue 5 of the handoff).
- The gateway contract's section 3 (the public scope): corrected on #6 (`af1b003`).

---

## 4. Decisions

### D-1 — A dependency goes when three things hold: nothing imports it, no advisory names it, and nothing requires it as a peer

**Decision.** Measured on 2026-11-28: accounts declares `@fastify/static` and `@fastify/view`, which nothing in it imports; the four services declare `supertest` and `@types/supertest`, which nothing imports (the tests call a started service); the gateway also declares `@fastify/cors`, `@fastify/formbody` and `@nestjs/config`, which nothing in it imports. None of these names an advisory in `tests/expected-audit.json`. Each is removed. `ts-morph`, which no service imports either, **stays**: `@nestjs/graphql` names it as a peer dependency, and the service's declaration is what holds it at 28.0.0 — remove the declaration and pnpm resolves the peer on its own, to whatever 28.x is newest, which is an upgrade nobody chose (the plan's R7). In the gateway, `@nestjs/jwt` is imported by one test file and declared under `dependencies`: it moves to `devDependencies`.

**Why.** Over removing by the list alone: a dependency can be unused by the code and still be required by the graph, or be a pin in fact. Over leaving all as it is: a manifest that declares what the code never imports misleads a reader and a scanner about the surface, as the review of #6 found.

### D-2 — The counts in a contract are counted from the code, in the notifications contract's form

**Decision.** For accounts, trading and the gateway, the line "**Counts.**" is rewritten as the notifications contract's was on 2026-11-27: the scenarios, the vulnerable operations, the safe operations built — protected counterparts and others — the ratio, and those designed and not built, with a link to the decision of the deliverable specification that names them. The count comes from the service's resolvers and controllers on the one hand and from its deliverable specification's sections on safe operations on the other; where the two disagree, the code is counted and the disagreement is in the report.

**Why.** Invariant 4 and ADR-013 ask each contract to record what it left out; these three count from before the owner's decision of 2026-11-26. Over copying the specification's number: the specification is the plan, the code is what was built.

### D-3 — The rule SC10 promises is an override of the linter, over the three subgraphs

**Decision.** In `.oxlintrc.json`, an override for `apps/accounts/**`, `apps/trading/**` and `apps/notifications/**` turns on `no-restricted-imports` for `@zazzles/exchange-http2` and for the four services' packages. The gateway is not in the override: calling the services is what it does.

**Why.** Measured on 2026-11-28: none of the three subgraphs imports the HTTP client library, and only the gateway calls `callService`; so the rule breaks nothing today and catches the first subgraph that reaches another. Over a unit test that greps the sources: the linter already runs on every push, before every push, and in CI; a test under `tests/` would be a second mechanism for one rule. Over forbidding `callService` by name: the import is the mechanism, and a name can be aliased.

### D-4 — The test library's `graphql()` returns the status its type declares

**Decision.** `GraphQLResponse` in `libs/testing/src/graphql.ts` declares `status: number`, and `graphql()` returns the parsed body cast to that type: `.status` is always `undefined`. It returns `{ status: response.status, ...(await response.json()) }`, and a unit test asserts the status of an answer. No test is changed to use it.

**Why.** The review of #8 found it: two new tests wrote their own POST helper to read a status, and a future test asserting `graphql(...).status` would compare `undefined` and pass for the wrong reason. The two local helpers stay as they are on #8, reviewed there; they can collapse onto the library in a later change.

### D-5 — The setup page is left to the release step

**Decision.** `docs/setup-and-testing.md` still shows the scaffolding's counts and outputs, and its table of variables lacks `AVATAR_ALLOWED_ORIGINS`. It is not touched here.

**Why.** Invariant 9: its numbers can be replaced only by a run's, and the run that counts is the one from a clean clone that the release step makes. Writing them twice is a command run twice for one line.

---

## 5. Agent implementation rules

Commit and push to `phase-2-cleanup` only; never merge, never touch another branch or worktree. Every command runs in `/Users/michael/Dev/zazzcode/vuln-nestjs-wt/cleanup`. The two shared changes a sub-agent makes by command are here the work itself: `pnpm install --frozen-lockfile` first, in the fresh worktree, and `pnpm build` before the first push; after a manifest changes, `pnpm install` (never `--frozen-lockfile`, which refuses) and `pnpm audit:check`.

**The lab's ports.** A service's `test:int` takes that service's port, and another agent's suites take them all until the Lead Agent says otherwise. The agent does everything that needs no port first, and runs the four `test:int` only when the Lead Agent says the machine is its own.

**Before every push:** `pnpm lint` with its summary line read, `pnpm format:check`, `pnpm test`, each exit code read; and, once the manifests changed, `pnpm audit:check`. One slice, one commit, one push; fifteen minutes at most between pushes; before the turn ends, commit and push everything and append "Where I stopped".

**Run log:** `.zazz/ephemeral/003b-cleanup-run-log.md`, append-only, the time from `date` in the same command that appends.

**Halt conditions:** a change is needed outside section 3; `pnpm audit:check` differs after a removal (an advisory was on a package: put the package back); `pnpm install` would change the version of any package other than those removed; a service's `test:int` does not exit 0 after a removal; a count in a contract cannot be established from the code.

---

## 6. Acceptance criteria

- **AC1 — No scaffold dependency nothing imports remains, and nothing else moved.** In the four manifests, `@fastify/static`, `@fastify/view`, `@fastify/cors`, `@fastify/formbody` and `@nestjs/config` (the gateway's) are gone where nothing imports them, `supertest` and `@types/supertest` are gone from the four, the gateway's `@nestjs/jwt` is under `devDependencies`, and `ts-morph` stays. `pnpm install` in the worktree exits 0; `git diff abead16..HEAD -- pnpm-lock.yaml` removes importers' lines for the packages removed and changes no other version: `git diff abead16..HEAD -- pnpm-lock.yaml | grep -E "^[+-] +version:"` prints nothing that is not a removed package's. `pnpm audit:check` exits 0 on 24 advisories. Verified by those commands, and by each service's `test:int` exiting 0 (AC2).
- **AC2 — Every service still builds and tests alone.** `pnpm build`, then the four `pnpm --filter @zazzles/exchange-<service> test:int`: each exit 0. Verified by each exit code.
- **AC3 — SC10's rule is in the linter and is live.** `.oxlintrc.json` holds the override of D-3. `pnpm lint` exits 0 with 0 warnings on the tree. With one line added to a file under `apps/accounts/src/` — `import '@zazzles/exchange-http2';` — `pnpm exec oxlint apps/accounts/src` names the file and the rule, exit 1; the line removed, it exits 0. Verified by those runs, their outputs in the run log.
- **AC4 — The builder's definition carries the two rules.** `.zcode/agents/service-builder.md` says, under its run log: that the time of a line comes from `date`, in the same command as the append, with the command; and that a regression check is done when its line is in the run log — what was removed or set, the file run, how many tests failed, the exploit test's name among them. Verified by reading.
- **AC5 — The three contracts count as built.** The lines "**Counts.**" of `accounts.md`, `trading.md` and `gateway.md` give the scenarios, the vulnerable operations, the safe operations built split into protected counterparts and others, the ratio, and those designed and not built with a link to the decision that names them; the totals equal what the code holds, counted by a script under `.zazz/ephemeral/` whose output is in the run log. Each of the three has a line "**Dependency versions this service is built with.**" that names every pin and every control its `package.json` holds, as `tests/expected-audit.json` attributes them; trading's is added, accounts' gains `lodash`. Verified by reading against the four manifests and the snapshot.
- **AC6 — The foundation's specification has its change log.** Section 13 of `001-foundation.md` has an entry for the build: what the scaffolding as merged (#2, `ae6f102`) differed from the specification in, what was merged unfinished, and which commits and pull requests finished each — taken from the run log and `git log`, with the hashes. Verified by reading, and by each hash naming a commit (`git cat-file -t`).
- **AC7 — `repository-layout.md` describes the tree.** Every path it names exists; nothing under `apps/`, `libs/`, `tests/`, `scripts/`, `catalog/`, `postman/` and `.github/` that a reader needs is missing from it; its versions are those of the manifests. Verified by a script under `.zazz/ephemeral/` that extracts the paths in backticks and checks each, and by reading.
- **AC8 — The descriptions of #2 and #5 say what happened.** Each opens with a dated note: merged unfinished on the date it was, the items that were open at the merge, and the pull request or commit that finished each; what follows is the body as it was, with its open boxes closed where they were finished. Nothing else in either pull request changes. Verified by `gh pr view 2 --json body` and `gh pr view 5 --json body`, read against `git log`.
- **AC9 — Scope.** `git diff abead16..HEAD --name-only` lists only the paths of section 3. `tests/expected-hashes.json` and `tests/expected-scanner-findings.json` are unchanged. Verified by that command.
- **AC10 — Clean.** `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test`: each exit 0 on the tip. Verified by each exit code.
- **AC11 — `graphql()` returns its status.** A unit test in `libs/testing/src/graphql.spec.ts` fails before the change (`status` is `undefined`) and passes after; every service's suite is unchanged by it (AC2). Verified by the test run before and after, both in the run log.

---

## 7. Test strategy

No new test of the repository: the rule of AC3 is the linter's, proven by breaking it once; the counts of AC5 are a script's output; the rest is the existing suites' exit codes.

---

## 8. Execution sequence

1. This specification, committed first; the draft pull request opened.
2. The test library (D-4): one commit, the test red first.
3. The manifests (D-1): one commit; `pnpm install`, `pnpm audit:check`, `git diff` of the lockfile read line by line.
4. The lint rule (D-3) and its proof: one commit.
5. The builder's definition (AC4): one commit.
6. The three contracts (D-2): one commit each, each count from its script.
7. `001-foundation.md`'s change log; `repository-layout.md`: one commit each.
8. When the Lead Agent says the machine is the agent's: `pnpm build` and the four `test:int`, each exit code in the run log (AC2). If one fails, the removal that caused it is reverted in its own commit and named in the report.
9. The descriptions of #2 and #5 (AC8).
10. The report; "Where I stopped".

---

## 9. Definition of done

- [ ] AC1 to AC11 verified, each with what verifies it.
- [ ] The four services' `test:int` exit 0 on the tip, each exit code in the run log.
- [ ] `git diff abead16..HEAD --name-only` lists only the paths of section 3.
- [ ] The report written; the run log current.
- [ ] CI green on the tip.

---

## 10. Open questions

- **OQ-1 — The package scope.** Open with the Project Owner since 2026-11-27 (open issue 5 of the handoff). Not this specification's.

---

## 11. Run log protocol

`.zazz/ephemeral/003b-cleanup-run-log.md` in the worktree: append-only, the time from `date` in the same command that appends; a line per command with its exit code, per count with the script's output, per commit with its hash and push.

---

## 12. Agent implementation prompt

```text
You are the Contributor Agent of .zazz/specifications/003b-cleanup.md of vuln-nestjs, a deliberately vulnerable NestJS lab. The flaws are the product.
Worktree: /Users/michael/Dev/zazzcode/vuln-nestjs-wt/cleanup — every command and file path is inside it.
Branch: phase-2-cleanup. Commit and push there only. Never merge, never touch another branch or worktree.
Specification: .zazz/specifications/003b-cleanup.md. Read AGENTS.md, then the specification whole.
You change no file of a service's code or tests, no pin, no snapshot by hand; the one library file you change is libs/testing/src/graphql.ts, with its test.
The lab's ports are not yours until the lead says so: do everything that needs no port first; run the four services' test:int only on the lead's word.
One slice, one commit, one push. Before every push: pnpm lint (read its summary line), pnpm format:check, pnpm test, and pnpm audit:check once a manifest changed; each exit code read.
Your run log is .zazz/ephemeral/003b-cleanup-run-log.md: append-only, a line at every event, its time from date in the same command.
Before you stop, for any reason: commit and push everything, and append "Where I stopped".
```

---

## 13. Implementation and review changes

- No changes recorded.

---

*End of specification.*
