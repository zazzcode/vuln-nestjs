# ADR-008 — Safe functional baseline first, deliberate flaws as twin operations

**Status:** Accepted by the Project Owner on 2026-11-26
**Date:** 2026-11-26

## Context

Every scenario needs a protected counterpart that receives the identical payload and stays inert. A counterpart is only evidence if it is a real, working pattern. The question is in what order the two kinds of code arrive, and how they sit together in one application.

## Decision

1. Step 2 writes every **safe** operation of a service first and correctly. Those operations are the counterparts.
2. Its vulnerable operations follow, each a **twin operation** in a separate file with a feature-plausible name. The safe operation is not modified to become unsafe.
3. Process-wide settings have no twin. They are changed in the options file that owns them, marked, and documented with the hardened value beside the weak one.
4. **About two safe operations for every vulnerable one.** A vulnerable operation has one protected counterpart, and a second one wherever a second technique exists. In the design: 118 safe, 62 vulnerable.
5. Names in code stay neutral. The catalogue holds the answer.
6. The vulnerable line carries a sink marker, as in vuln-nextjs.

## Options considered

| Option | Why not |
| --- | --- |
| Write the flaws into the functional operations from the start | There is no counterpart to test against, so "exploitable" has nothing to be compared with. A functional test would assert broken behaviour as the feature. The first review of a service would mix "does it work" with "is it broken on purpose" |
| Put every weakness in a separate "lab" area with no functional role | Unrealistic. A scanner meets weaknesses inside features, and the Project Owner asked for a functional application |
| Neutral names with no sink markers anywhere | Makes maintenance harder: nothing in the source links a line to its catalogue entry. A holdout batch at release gives the unmarked case where it is wanted |

## Consequences

- The graph ends up with more operations than a real exchange would have: a safe one and a twin. The documentation maps them.
- Review is separated: the safe operations are reviewed as ordinary code, the vulnerable operations as labelled additions.
- The functional code doubles as the negative controls of the catalogue.
- The marker reveals the answer to a scanner that reads comments. That is accepted for the main catalogue (open question Q5 in the [project plan](../../project/project-plan.md#10-open-questions)).

## Related

The mechanics are in [security-model.md](../security-model.md#5-how-a-deliberate-flaw-is-added) and the test pattern in [testing-strategy.md](../testing-strategy.md#3-scenario-tests-in-both-directions).
