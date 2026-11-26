## Context

- **Step:**
- **Specification:** `.zazz/specifications/…`
- **PR status:** Draft until the specification is approved. Ready for review once the definition of done is met.

## Why

What this step is for, and what is true after it that was not true before.

## Functional overview

What changed in behaviour, grouped by service or by area. File-by-file inventories belong in the diff.

## Reviewer notes

### Acceptance criteria

One line per criterion from the specification, with the test or command that covers it.

- [ ] **AC-1** — …
  - Automated coverage:
  - Manual confirmation still needed:

### Scenarios added or changed

For a step that adds weaknesses. Otherwise write "none".

| ID | Vulnerable operation | Protected counterpart | Exploit test | Newman request | Documentation |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Review focus

- [ ] The implementation satisfies the specification
- [ ] The change stays inside the specification's scope
- [ ] No invariant of `AGENTS.md` is broken: no vulnerable operation was fixed, no pin was upgraded, the safety rails are in place, nothing was added that only matters for an application that stays up
- [ ] Generated ground truth (`tests/expected-*.json`) was re-snapshotted, not edited, and the snapshot change is justified by a source change in this PR

## Verification

Only what actually ran.

- Automated tests run and passed:
- Manual validation performed:
- Not run / not verified:

## Risks and notes

- Known risks:
- Follow-ups that belong to a later step:
