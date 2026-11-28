# Testing strategy

**Status:** revised on 2026-11-26, and again the same day once the scaffolding had run: the lab is four processes, not one; the Postman collections are one per microservice; and `pnpm test:api` starts the lab itself. `docs/setup-and-testing.md` records each command only after it has been run. On 2026-11-28 a request per scenario became a check: `pnpm scenario:check` fails on a registered scenario with no request named after it under `postman/`.

## 1. What the tests are for

Two different jobs, and they must not be confused:

- **Functional tests** prove the sample application works: the administrator can credit a wallet, a user can buy a coin, an alert fires.
- **Scenario tests** prove a deliberate weakness is exploitable and, where there is one, that its protected counterpart is inert. A scenario test that starts failing usually means someone fixed the flaw.

Because the application is ephemeral, tests never need fixtures that persist. Every run starts the lab, which loads the same fake data, and stops it.

## 2. Layers

| Layer | Runner | Where | What it proves |
| --- | --- | --- | --- |
| Unit | Vitest | `*.spec.ts` beside the code | One class or function in isolation: a money calculation, a price tick, a URL allowlist |
| Integration | Vitest | `apps/<service>/test/*.int-spec.ts` | One service started alone on its own port, with its real in-memory store. Every operation of its [specification](../project/services/README.md), each scenario in both directions. No other service runs |
| End to end | Vitest | `tests/e2e/*.e2e-spec.ts` | The lab as four processes, started by the code `pnpm start` runs, on the lab's own ports. Federation across services, the protocols, reset, and a clean stop |
| API collection | Newman | `postman/<service>/` | The same requests a person sends from Postman: one collection per microservice, each calling its service on its own address, and one for the gateway. `pnpm test:api` starts the lab and runs every one |
| Ground truth | Node scripts | `scripts/` | The committed snapshots match the catalogue, the source files and the audit output |

### Integration: the service for real

The test starts the service as it runs, on its own port with its own store, through `startService` in `libs/testing`, and calls it there. `app.inject()` was the plan; it sends a fake request without opening a port, which cannot show the protocol a listener speaks. The test still creates the application with the adapter the service uses, or it tests a different stack.

### End to end: four processes

It could not be the whole lab in one process, as first planned. Nest's code-first GraphQL keeps every registered type in one storage per process: two subgraphs in one process put two `User` types into it, and the gateway cannot compose them. A lab is four processes or nothing.

So each end-to-end file runs the lab once, through the same `startLab` function `pnpm start` runs, and stops it afterwards. A stop fails the file when:

- a database process or a temporary directory the run created remained;
- a service had to be killed instead of stopping;
- a service's process did not report its outgoing connections, or reported a connection or a name resolution that does not go to this machine;
- anything still listens where a relay of the run was.

Tests call the gateway's address and nothing else, unless the scenario is about calling something else (GQL-007, SSRF-001). A test reaches a service over HTTP/1.1 through `lab.http1Url(service)`: the service's own address where it speaks HTTP/1.1, and the relay in front of it where it speaks HTTP/2. Each file has a lab of its own, which loads the fake data as it starts.

The protocols are proved by exclusion. Each listener speaks exactly one protocol, so a call that succeeded proves which one the caller used, and one that reached nothing proves it speaks no other.

Tests run in one file at a time. The lab has fixed ports and shared fake data, so parallel files would collide.

## 3. Scenario tests in both directions

The pattern from vuln-nextjs, kept because it works. One payload, two targets.

```ts
// Illustrative. The helper arrives with the scaffolding.
const payload = { userId: erin.id, amount: '500.00' };

const exploited = await graphqlAs(alice).mutate('creditWallet', payload);
expect(exploited.data.creditWallet.available).toBe('1000.00'); // ACCESS-003: a user credited another user

const refused = await graphqlAs(alice).mutate('deposit', payload);
expect(refused.errors[0].extensions.code).toBe('FORBIDDEN'); // the counterpart refused the identical payload
```

Rules:

- The payload is the same object for both calls.
- The exploit assertion names what was gained: a marker, a balance, a file's contents.
- The counterpart assertion names why it was refused, not only that it failed.
- Exploits use harmless markers. `zazzles-lab-marker`, `42`, a file created by the test under a temporary directory.
- A race scenario fires its requests with `Promise.all` and asserts the end state (an overdrawn wallet, an oversold quantity).

## 4. Postman and Newman

The Project Owner asked for Postman and Newman or another recommended tool, and on 2026-11-26 asked in addition for API tests for each microservice. The recommendation is to keep Postman and Newman, for one reason: vuln-nextjs documents its reproductions with Postman, curl and Burp, and the two labs should be used the same way. The collections are one per microservice because four builders work at once, and because a microservice's tests belong with its code. The relays of [ADR-012](decisions/ADR-012-http1-relay-in-front-of-http2-services.md) are what let Newman reach `accounts` and `trading`, which speak HTTP/2 cleartext.

| Piece | Path | Notes |
| --- | --- | --- |
| Collections | `postman/<service>/vuln-nestjs.<service>.postman_collection.json` | One per microservice, calling that service on its own address, and one for the gateway. Each service's builder owns its folder. A GraphQL request is a `POST` with a JSON body of `query` and `variables` |
| Environment | `postman/local.postman_environment.json` | The addresses on the lab's default ports, and four token variables left empty |
| Requests | one per scenario | With a test script that asserts what was gained, or why it was refused |
| Runner | `pnpm test:api` | Starts the lab through the launcher's own code, gives Newman the addresses of the run and tokens it makes for three fake users, in memory and written nowhere, runs every collection to the end, and stops the lab under the end-to-end suite's checks |
| Guards | `tests/api/collections.spec.ts`, run by `pnpm test` | A collection fails that asks for a variable nobody provides, or sends a request without a test script. So does the committed environment, if it drifts from what a run provides |

The variables a collection may use: `gatewayUrl`, `accountsUrl`, `tradingUrl`, `notificationsUrl`, `accessToken` (Alice, a user), `adminToken` (an administrator), `bobToken` (Bob, a user) and `internalToken` (the run's service token). `accountsUrl` and `tradingUrl` are the relays.

What Newman is and is not:

- It **is** the proof that every reproduction in the documentation works from a stock client, and the way a person explores the API.
- It **is not** where the regression suite lives. A race needs parallel requests and a precise assertion; that is Vitest. Newman carries one request per scenario, enough to show the exploit and to keep the documentation honest.

If the Project Owner prefers a text-first tool later, [Bruno](https://www.usebruno.com/) is the alternative: collections are plain files, and its CLI plays the same role as Newman. Nothing in this plan depends on the choice.

## 5. Ground truth

Generated from `catalog/catalog.json`, committed, and never edited by hand. The design is carried over from vuln-nextjs.

| File | Generated by | Holds |
| --- | --- | --- |
| `tests/expected-hashes.json` | `pnpm scenario:update` | SHA-256 of every registered source file, vulnerable and protected |
| `tests/expected-scanner-findings.json` | `pnpm scenario:update` | Per source file: `expectedFinding`, the CWE, and the scanner kind. This is how a scanner run is scored |
| `tests/expected-audit.json` | `pnpm audit:update` | The output of `pnpm audit --prod --json` for every workspace |

| Check | Fails when |
| --- | --- |
| `pnpm scenario:check` | A registered file changed, a catalogue entry points at a file that does not exist, or a registered scenario has no request named after it under `postman/` |
| `pnpm audit:check` | The audit differs from the snapshot. It is its own CI job, because a new upstream advisory must be visible and must not stop the tests |
| `pnpm audit:update` | The audit returns an advisory the snapshot has and the update was not told to retire it by name |

The scripts arrived with the scaffolding and an empty catalogue, on 2026-11-26. Each service fills in its own entries.

## 6. CI

One workflow, `.github/workflows/ci.yml`, on every pull request and on `main`, in three jobs:

| Job | Runs |
| --- | --- |
| `test` | Install, with pnpm from `packageManager`. Lint, format check, `pnpm test`, `pnpm build`, `pnpm test:int`, `pnpm test:e2e`, `pnpm test:api`. The two database binaries are cached between runs, where the packages keep them |
| `ground-truth` | `pnpm scenario:check`, then `pnpm audit:check`. Its own job, so that a new upstream advisory is visible and stops nothing else |
| `audit` | `pnpm audit --prod`, never blocking. Its nonzero exit is the scenario working |

Afterwards a job that started the lab fails if a `mongod` or a `mysqld` is still running. A lab that cannot be stopped cleanly is not ephemeral.

## 7. Definition of done

For any change:

```text
pnpm lint && pnpm format:check && pnpm test && pnpm test:int
pnpm build && pnpm test:e2e && pnpm test:api
pnpm scenario:check && pnpm audit:check
```

For a change that adds a scenario, additionally:

- The exploit test passes against the twin and the counterpart assertion passes against the protected operation, in CI.
- The Newman request for the scenario passes.
- The documentation module exists and every command in it has been run.
- The catalogue entry exists and the snapshots were regenerated in the same commit.

## 8. What is not tested

Load, endurance, memory over hours, recovery from a crashed service, behaviour under a restarted peer. They matter for an application that stays up, and this one does not.
