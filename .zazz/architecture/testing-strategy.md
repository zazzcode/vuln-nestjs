# Testing strategy

**Status:** proposed in Phase 0. Commands are named as they are planned; `docs/setup-and-testing.md` records each one only after it has been run.

## 1. What the tests are for

Two different jobs, and they must not be confused:

- **Functional tests** prove the sample application works: the administrator can credit a wallet, a user can buy a coin, an alert fires.
- **Scenario tests** prove a deliberate weakness is exploitable and, where there is one, that its protected counterpart is inert. A scenario test that starts failing usually means someone fixed the flaw.

Because the application is ephemeral, tests never need fixtures that persist. Every run starts the lab, which loads the same fake data, and stops it.

## 2. Layers

| Layer | Runner | Where | What it proves |
| --- | --- | --- | --- |
| Unit | Vitest | `*.spec.ts` beside the code | One class or function in isolation: a money calculation, a price tick, a URL allowlist |
| Integration | Vitest | `apps/<service>/test/*.int-spec.ts` | One service with its real in-memory store, through `app.inject()`. No sockets, no other services |
| End to end | Vitest | `tests/e2e/*.e2e-spec.ts` | All four services started in the test process, real ports, real hops. Federation across services, HTTP/2 between the Fastify services, every scenario that needs a second service or a second request |
| API collection | Newman | `postman/` | The same requests a person sends from Postman, against a running stack. Functional flows and one request per scenario exploit |
| Ground truth | Node scripts | `scripts/` | The committed snapshots match the catalogue, the source files and the audit output |

### Integration: `app.inject()`

NestJS's testing module creates the application and `app.inject()` sends a fake request without opening a port. It works on the Fastify adapter and on the Express adapter. The test must create the application with the adapter the service uses, or it tests a different stack.

### End to end: the whole lab in one process

A global setup starts the three backend services and the gateway in the test process, each on a loopback port, each with its own in-memory store. It waits for `/internal/health` on each service and for the gateway to answer. A global teardown stops them, which stops the database engines.

Tests call `http://127.0.0.1:3000` and nothing else, unless the scenario is about calling something else (GQL-007, SSRF-001). Between tests, `POST /api/v1/lab/reset` restores the fake data.

A test that must observe HTTP/2 reads the protocol of the request on the service side: one placeholder subgraph records `req.raw.httpVersion` for each request, and the test asserts the gateway's fetches arrived as `"2.0"`.

Tests run in one file at a time. The lab has fixed ports and shared fake data, so parallel files would collide.

## 3. Scenario tests in both directions

The pattern from vuln-nextjs, kept because it works. One payload, two targets.

```ts
// Illustrative. The real helper arrives with Phase 5.
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

The Project Owner asked for Postman and Newman or another recommended tool. The recommendation is to keep Postman and Newman, for one reason: vuln-nextjs documents its reproductions with Postman, curl and Burp, and the two labs should be used the same way.

| Piece | Path | Notes |
| --- | --- | --- |
| Collection | `postman/vuln-nestjs.postman_collection.json` | Folders per service, then per phase. A GraphQL request is a `POST` with a JSON body of `query` and `variables` |
| Environment | `postman/local.postman_environment.json` | `baseUrl` (`http://127.0.0.1:3000`), the lab users, tokens captured by a sign-in request |
| Exploit folder | one per scenario family | One request per scenario, with a test script that asserts the marker |
| Runner | `pnpm test:api` | `newman run … --bail` against a running stack. CI starts the stack first |

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
| `pnpm scenario:check` | A registered file changed, or a catalogue entry points at a file that does not exist |
| `pnpm audit:check` | The audit differs from the snapshot. It is its own CI job, because a new upstream advisory must be visible and must not stop the tests |
| `pnpm audit:update` | The audit returns an advisory the snapshot has and the update was not told to retire it by name |

The scripts arrive in Phase 5, proven on the pilot batch.

## 6. CI

One workflow, `.github/workflows/ci.yml`, on every pull request and on `main`:

| Step | Runs |
| --- | --- |
| Install | `pnpm install --frozen-lockfile`, with pnpm from `packageManager` through corepack |
| Static | Lint, format check |
| Unit and integration | `pnpm test`, `pnpm test:int` |
| Build | `pnpm build` for every workspace |
| End to end | `pnpm test:e2e`, with the database binaries cached between runs |
| API collection | Start the built stack, wait for `/api/v1/health`, run `pnpm test:api`, stop it |
| Audit information | `pnpm audit --prod`, never blocking. Its nonzero exit is the scenario working |
| Audit ground truth | `pnpm audit:check`, a separate job |

After every step that starts the lab, CI checks that no `mongod` or `mysqld` process is left. A lab that cannot be stopped cleanly is not ephemeral.

## 7. Definition of done

For any change:

```text
pnpm lint && pnpm test && pnpm test:int
pnpm build && pnpm test:e2e
pnpm scenario:check && pnpm audit:check      (from Phase 5)
```

For a change that adds a scenario, additionally:

- The exploit test passes against the twin and the counterpart assertion passes against the protected operation, in CI.
- The Newman request for the scenario passes.
- The documentation module exists and every command in it has been run.
- The catalogue entry exists and the snapshots were regenerated in the same commit.

## 8. What is not tested

Load, endurance, memory over hours, recovery from a crashed service, behaviour under a restarted peer. They matter for an application that stays up, and this one does not.
