# The `trading` service — Deliverable Specification

**Worktree / branch:** `vuln-nestjs-wt/trading` / `phase-2b-trading`
**Feature:** the services of VCX · **Milestone:** Step 2 of the implementation plan
**Deliverable:** the `trading` service, finished: 21 scenarios, each built, with its test passing
**Project Owner / Deliverable Owner:** the Project Owner · **Drafted:** 2026-11-27
**Delivery topology:** single-deliverable branch · **Review artifact:** one draft pull request to `phase-1-foundation`
**Decomposition rationale:** the plan gives one service one builder, one branch and one pull request; sibling branches for the other services, because four builders work at once and no service calls another (ADR-010).
**Integration branch:** `phase-1-foundation` · **Merge policy:** PR review required — the agent commits and pushes this branch only
**Run log:** `.zazz/ephemeral/002b-trading-report.md` (the final report; ignored by Git) · **Execution tracking:** none. The pull request is the record
**Implementation coordination:** one Contributor Agent, working alone · **Companion skills:** none
**Standards:** none adopted. `AGENTS.md` stands in for the index.

## 0. Capability

Builds the `trading` microservice of the lab as its [service specification](../project/services/trading.md) describes: a Fastify subgraph on HTTP/2 with a MySQL store, its fake data, 20 vulnerable operations and the safe operations that are their protected counterparts. Every one of its 21 scenarios is built, has a test in both directions that passes, a documentation module with a reproduction that was run, a request in its Postman collection and a catalogue entry. The flaws are the product: none is fixed, and no safe operation claims more than it proves.

## 1. Required reading

- [AGENTS.md](../../AGENTS.md): the invariants, what a sub-agent may write, the commands.
- [trading.md](../project/services/trading.md): sections 2 to 6. The contract: data, fake data, API, the 21 scenarios, the markers.
- [implementation-plan.md](../project/implementation-plan.md): section 3, "Order of work inside a service" and "What a service must show to be done".
- [security-model.md](../architecture/security-model.md): sections 3, 4 and 5. [testing-strategy.md](../architecture/testing-strategy.md): sections 2, 3 and 4.
- [ADR-013](../architecture/decisions/ADR-013-counterpart-and-one-and-a-half-safe-per-vulnerable.md): the ratio, and that a counterpart outranks it.
- [ADR-004](../architecture/decisions/ADR-004-ephemeral-stores.md), [ADR-010](../architecture/decisions/ADR-010-services-never-call-each-other.md).
- The skeleton under `apps/trading/`, and the exports of `libs/*` (each `src/index.ts`).
- Requirements: FR-4.1 to FR-4.6; NFR-1, NFR-2, NFR-4, NFR-5, NFR-6, NFR-10, NFR-11, NFR-12.
- Existing code to mirror: `apps/trading/src/orders/` (a repository, a service, a resolver with an ownership check), `apps/trading/test/app.int-spec.ts`.

## 2. Invariants

The ten invariants of `AGENTS.md`, verbatim. Those this deliverable touches most:

- **INVARIANT 1 — never fix a vulnerable operation.** A test that proves a flaw stopped being exploitable is a regression.
- **INVARIANT 2 — never upgrade or remove a vulnerable dependency pin.**
- **INVARIANT 3 — a protected counterpart is a scoped claim:** "this pattern defeats this flaw for identical input", never "secure in general".
- **INVARIANT 4 — every vulnerable operation has a protected counterpart**, built with its test. Where the ratio and the counterpart disagree, the counterpart is built and the ratio gives way.
- **INVARIANT 5 — the safety rails stay.** Loopback only, fake data, harmless markers (`42`, `zazzles-lab-marker`, `package.json` of this service), no telemetry.
- **INVARIANT 6 — services never call each other.**
- **INVARIANT 9 — never document a command that has not been run.**
- **INVARIANT 10 — names in code stay neutral.** The vulnerable line carries the marker.

## 3. Scope

**Approved review shape:** one pull request. Alternative rejected: a stack of one branch per scenario family, which would put seven branches in the way of one service's review.

**Strict scope constraint.** Every file this specification adds or changes is under `apps/trading/`, `postman/trading/`, `docs/vulnerabilities/trading-*.md` and this file. Three shared files change by command and never by hand: `apps/trading/package.json` gets its pins through `pnpm add --save-exact --filter @zazzles/exchange-trading`, `pnpm-lock.yaml` follows, and `tests/expected-audit.json` is rewritten by `pnpm audit:update`.

| Path | New / modified | Reason |
| --- | --- | --- |
| `apps/trading/src/**` | modified, new | Entities, seed, safe and vulnerable operations |
| `apps/trading/test/**` | modified, new | The service's tests |
| `apps/trading/package.json` | modified, by command | The three pins |
| `apps/trading/reports/files/` | generated at a run, ignored | Where the report files of a run are written. Removed on stop |
| `postman/trading/vuln-nestjs.trading.postman_collection.json` | modified | One request per scenario |
| `docs/vulnerabilities/trading-{sql,access,logic,inject,fs,res,gql}.md` | new | One module per family, this service's scenarios only |
| `.zazz/ephemeral/002b-trading-catalogue.json` | new, ignored | The 21 catalogue entries, for the lead agent |

**Out of scope:** `libs/`, `catalog/`, `tests/`, `scripts/`, the Postman environment, the other collections, `docs/vulnerabilities/index.md` and `dependencies.md`, every other service.

## 4. Decisions

- **D-1 — Each vulnerable operation in its own file, under a feature name.** Why: the catalogue points at the file that carries the weakness, and a scanner finding must point at the pattern under test (NFR-12). A flaw is never put into the file of its counterpart.
- **D-2 — A vulnerable query is written in its own resolver or controller.** Why: source and sink sit in the registered file, so what a scanner sees and what the catalogue hashes are the same thing. A service layer between them would hide the flow.
- **D-3 — Money is integer minor units, and every safe change of a balance goes through one conditional `UPDATE … WHERE balance + ? >= 0`, with the ledger entry written beside it.** Why: it is how the baseline in security-model section 4 reads, and it is what LOGIC-001 and LOGIC-002 are measured against. A read-then-write in safe code would make the counterparts straw men.
- **D-4 — `orders` gains a `reference` column (`ord-<id>`).** Why: the contract has `orderByReference(ref)` and no other field is a reference. The alternative, reading `ref` as the id, would make it a second `order(id)`.
- **D-5 — Report files are written under `apps/trading/reports/files/` at seed time and removed on stop.** Why: the marker of FS-004 is this service's `package.json`, which is two directories above that one. A directory under the system's temporary directory has no such file. `apps/trading/.gitignore` ignores it.
- **D-6 — Documentation modules are named `trading-<family>.md`.** Why: four builders write into one `docs/vulnerabilities/`, and `access.md`, `gql.md` and others would be written by three of them at once. The lead agent names them as it integrates.
- **D-7 — The pins are installed with the commit of SQL-001**, the first scenario built. Why: it is the first scenario that reaches `mysql2` through a raw query and the first that runs on the pinned adapter. All three are pinned at once, so the service is built and tested against the versions it ships with, not against newer ones that are then replaced.
- **D-8 — Thirty-one safe operations are built: the 29 that are a scenario's counterpart, `orders`, and `cancelOrder`.** Why: 29 counterparts is under the thirty of ADR-013, and `cancelOrder` is the most needed operation that is nobody's counterpart (FR-4.3: without it the funds of a limit order never return). The seven not built are in section 13.

## 5. Agent implementation rules

Work only in the worktree named above. Commit and push to `phase-2b-trading` after each step; never merge, never commit to another branch. Run only this service's commands (`pnpm --filter @zazzles/exchange-trading test`, `… test:int`) and the root's `pnpm lint`, `pnpm build`, `pnpm format:check`. Run `pnpm test:api` only with the port set 4200, 4201 to 4203, 4211, 4212. Nothing is left running at the end. Record each step in `.zazz/ephemeral/002b-trading-report.md`.

**Halt conditions:** the service's own tests cannot be made to pass; a shared file blocks every scenario; a pin does not work with the core it must interoperate with (then build on without it and report it, never substitute another version); a change is needed outside the scope above.

## 6. Acceptance criteria

- **AC1 — The fake data.** After a start, and again after `POST /internal/lab/reset` with the service token, the store holds the rows of trading.md section 3: five users with six wallets each, five markets, two open limit orders per market, three trades per market, one report per user. Verified by `apps/trading/test/safe.int-spec.ts`.
- **AC2 — Every safe operation built does what its row says.** The 31 of section 7. Verified by `apps/trading/test/safe.int-spec.ts`, one test per operation.
- **AC3 — Money is conserved by the safe operations.** After the sequence of safe operations in the test, each wallet balance equals the sum of that user's ledger entries for that asset. Verified by `safe.int-spec.ts`.
- **AC4 — Authorization.** Every operation marked admin answers `FORBIDDEN` to a user. Every own-data operation answers `FORBIDDEN` for another user's object, and `NOT_FOUND` where nothing is stored. Verified by `safe.int-spec.ts`.
- **AC5 — Concurrency.** Under `Promise.all` of ten parallel calls, `withdraw` and `POST /internal/wallets/withdraw` answer once and refuse nine, and two parallel `tickPrices` fill an order once. Verified by `safe.int-spec.ts`.
- **AC6 — Every scenario, in both directions.** For each of the 21: the payload of section 8 goes to the vulnerable operation and to each protected counterpart. The exploit assertion names what was gained. The counterpart assertion names why it was refused. Verified by the file the table names.
- **AC7 — The marker.** Each of the 20 vulnerable operations is in its own file and its vulnerable line carries `// <ID> / CWE-<n>: …`. Verified by review of `git diff phase-1-foundation --stat`.
- **AC8 — Documentation and Postman.** Each scenario has a section with a reproduction that was run, and one request in the trading collection whose script asserts what was gained. `pnpm test:api` passes on the port set above. Verified by that run.
- **AC9 — The catalogue.** `.zazz/ephemeral/002b-trading-catalogue.json` holds 21 entries, valid against `catalog/catalog.schema.json`, whose `source`, `safeControl`, `safeControls`, `documentation` and `test` paths exist on the branch.
- **AC10 — The pins.** `mysql2` 3.9.3, `@nestjs/platform-fastify` 12.0.1 and `fastify` 5.12.1 are exact production dependencies of `apps/trading`, and `pnpm audit --prod` reports every advisory that `docs/vulnerabilities/dependencies.md` lists for SCA-005 and SCA-008. `tests/expected-audit.json` is rewritten by `pnpm audit:update` in the same commit.
- **AC11 — Clean.** `pnpm lint`, `pnpm build`, `pnpm --filter @zazzles/exchange-trading test`, `pnpm --filter @zazzles/exchange-trading test:int` and `pnpm format:check` each exit 0. After a stop no `mysqld` process, no temporary directory and no `apps/trading/reports/files/` remain.
- **AC12 — Scope.** `git diff phase-1-foundation --stat` lists only the paths of section 3.

## 7. Safe operations

Reference data: the fake data of trading.md section 3, through `@zazzles/exchange-lab-data`. Tests start the service alone with `startService`, as `test/app.int-spec.ts` does, and reset it with the service token between scenarios that change money.

**Built, 31.** The 29 counterparts of section 8: `markets(q)`, `marketsByAssets`, `trades`, `tradesNamed`, `highPrice`, `settlementPrice`, `order`, `orderByReference`, `ordersAmong`, `wallet`, `ledger`, `wallets(userId)`, `User.orders`, `deposit`, `withdraw`, `tickPrices`, `settleOrder`, `placeOrder`, `buyAtMarket`, `updateOrder`, `convertExact`, `GET /internal/reports/:id`, `GET /internal/reports/file/:name`, `GET /internal/reports/trades.csv`, `GET /internal/reports/trades.json`, `POST /internal/admin/deposits`, `POST /internal/admin/prices/tick`, `POST /internal/wallets/withdraw`, `PUT /internal/orders/:id`. And two more: `orders`, `cancelOrder`.

**Tests.** `apps/trading/test/app.int-spec.ts` (kept from the skeleton: health, HTTP/2, the guards on `_entities`, reset, a dropped table, the schema) and `apps/trading/test/safe.int-spec.ts`: the fake data (AC1), one test per safe operation (AC2), the ledger invariant (AC3), one table-driven test for the admin operations and one for the own-data operations (AC4), three under `Promise.all` (AC5). No unit test is added for money beyond the skeleton's `orders.service.spec.ts`, which is updated with the richer `Order`.

## 8. The scenarios

Each row: the payload, sent as written to every operation in the row. "Refused" names the reason the test asserts.

| ID | Operation | Payload and what is gained | Protected 1: why refused | Protected 2: why refused | Test |
| --- | --- | --- | --- | --- | --- |
| SQL-001 | `orderLookup(id)` | Bob sends `id: "1 OR 1=1"` and reads order 1, Alice's | `order(id)`: not a whole number, `BAD_USER_INPUT`; a number that is stored is checked against the caller | `orderByReference(ref)`: bound with `?`, no row, `NOT_FOUND` | `test/scenarios/sql.int-spec.ts` |
| SQL-002 | `tradeHistory(input)` | `symbol: "BTC-USD' OR '1'='1"`, `side: BUY`: trades of other symbols | `trades(symbol)`: the symbol is bound, `[]` | `tradesNamed`: named parameters, `[]` | `test/scenarios/sql.int-spec.ts` |
| SQL-003 | `searchMarkets(q)` | `q: "zzz' OR 1=1 -- "`: all five markets | `markets(q)`: bound, wildcards escaped, `[]` | `marketsByAssets`: the string is not an `Asset`; the schema refuses it | `test/scenarios/sql.int-spec.ts` |
| SQL-004 | `tradesSorted(symbol, sortBy, sortDir)` | `sortBy` a `CASE` on Erin's wallet balance: the order of the answer says it is above 400.00 | `trades(orderBy)`: the string is not a `TradeOrderBy`; the schema refuses it | `tradesNamed`: a fixed order; `sortBy` is not an argument of it | `test/scenarios/sql.int-spec.ts` |
| SQL-005 | `volumeFor(symbol)` | `symbol: "\\' OR 1=1 -- "`: the volume of every market, added | `highPrice(symbol)`: through `sql`, bound; `NOT_FOUND` | `markets(q)`: bound, `[]` | `test/scenarios/sql.int-spec.ts` |
| SQL-006 | `feesPaid(symbol)` | `symbol: "' OR '1'='1"`: every user's fees, added | `settlementPrice(symbol)`: `execute()` with parameters; `NOT_FOUND` | `orderByReference(ref)`: bound; `NOT_FOUND` | `test/scenarios/sql.int-spec.ts` |
| SQL-007 | `ordersByIds(ids)` | `ids: ["0) OR (1=1"]`: every user's orders | `ordersAmong(ids)`: bound with `In`, scoped to the caller, `[]` | `orderByReference(ref)`: bound; `NOT_FOUND` | `test/scenarios/sql.int-spec.ts` |
| ACCESS-008 | `walletOf(userId)` | Alice sends `u-erin`: Erin's six balances | `wallet`, `ledger`: no `userId` argument; Alice's own | `wallets(userId)`: `FORBIDDEN`, needs `ADMIN` | `test/scenarios/access.int-spec.ts` |
| ACCESS-002 | `orderDetails(id)` | Alice sends Bob's order: its id, memo and price | `order(id)`: `FORBIDDEN`, read by who placed it | `User.orders` for `u-bob`: `FORBIDDEN` | `test/scenarios/access.int-spec.ts` |
| ACCESS-009 | `creditWallet(userId, amount)` | Alice credits herself 500.00: 10500.00 | `deposit`: `FORBIDDEN`, needs `ADMIN` | `POST /internal/admin/deposits`: 403, roles guard | `test/scenarios/access.int-spec.ts` |
| ACCESS-010 | `PATCH /internal/orders/:id` | Alice's own order, `{"status":"FILLED","userId":"u-bob"}`: both stored | `updateOrder`: `UpdateOrderInput` has only `memo`; the schema refuses it | `PUT /internal/orders/:id`: 200, only `memo` is written; `OPEN` and `u-alice` stay | `test/scenarios/access.int-spec.ts` |
| ACCESS-007 | `setReferencePrice(symbol, price)` | BTC-USD at `1.00`; a market buy of 1 BTC then costs 1.00 | `tickPrices`: `FORBIDDEN`, needs `ADMIN` | `POST /internal/admin/prices/tick`: 403, roles guard | `test/scenarios/access.int-spec.ts` |
| LOGIC-001 | `payout(amount)` | `-500.00`: Alice's USD goes up to 10500.00 | `withdraw`: `BAD_USER_INPUT`, `@Min(0.01)` | `POST /internal/wallets/withdraw`: 400, `exclusiveMinimum` | `test/scenarios/logic.int-spec.ts` |
| LOGIC-002 | `payout(amount)` | Erin (500.00), ten parallel `500.00`: ten answered, 5000.00 paid out of 500.00 | `withdraw`, ten parallel: one answered, nine refused by one conditional update | the REST withdraw: a transaction with `SELECT … FOR UPDATE`, nine refused | `test/scenarios/logic.int-spec.ts` |
| LOGIC-003 | `quickBuy(symbol, quantity, price)` | 0.00010000 BTC at `0.01`: the coin for 0.00 | `placeOrder`: no `price` in `PlaceOrderInput`; the schema refuses it | `buyAtMarket`: `price` is not an argument; charged 6.50 at the server's price | `test/scenarios/logic.int-spec.ts` |
| LOGIC-004 | `convert(asset, amount)` | `USD`, 8.2: `8.19`, a minor unit short | `placeOrder`: decimal strings, integer minor units: 8.20 is 820 cents | `convertExact`: a decimal library, rounding mode named: `8.20`. The value 8.20 goes to each in the type its argument takes | `test/scenarios/logic.int-spec.ts` |
| LOGIC-005 | `matchOrder(orderId)` | Two parallel calls on order 1: 1.00000000 BTC credited, twice 0.5 | `tickPrices`, two parallel: filled once, a row lock and a conditional status update | `settleOrder(orderId, tickId)`, same tick twice: one trade, the unique key | `test/scenarios/logic.int-spec.ts` |
| INJECT-001 | `GET /internal/reports/trades-raw.csv` | A memo of `=zazzles-lab-marker`: the cell is a formula | `GET /internal/reports/trades.csv`: `'=zazzles-lab-marker` | `GET /internal/reports/trades.json`: JSON, an attachment | `test/scenarios/exports.int-spec.ts` |
| FS-004 | `GET /internal/reports/files/:name` | `..%2F..%2Fpackage.json`: this service's manifest | `GET /internal/reports/:id`: the name comes from the database; `NOT_FOUND` | `GET /internal/reports/file/:name`: resolved outside the directory, `FORBIDDEN` | `test/scenarios/exports.int-spec.ts` |
| RES-002 | `allTrades(symbol, limit)` | `limit: 100000`: every row, 253 where the table holds 253 | `trades`: capped at 200 | `tradesNamed`: pages of at most 200 | `test/scenarios/graph.int-spec.ts` |
| GQL-006 | `giftOrder(toUserId, input)` | `toUserId: "u-erin"`: the order is stored as Alice's, its `user` is a reference to Erin | `placeOrder`: no `toUserId`; the schema refuses it, and the reference is the stored `userId` | `User.orders` for `u-erin`: `FORBIDDEN` | `test/scenarios/graph.int-spec.ts` |

Documentation: `docs/vulnerabilities/trading-sql.md` (SQL-001 to SQL-007), `trading-access.md` (ACCESS-002, 007, 008, 009, 010), `trading-logic.md` (LOGIC-001 to 005), `trading-inject.md`, `trading-fs.md`, `trading-res.md`, `trading-gql.md`. Postman: one folder per family in `postman/trading/`, one request per scenario.

## 9. Execution sequence

1. This specification, committed first; push; open the draft pull request to `phase-1-foundation`.
2. Entities, seed, `/internal/health`, `/internal/lab/reset` (AC1).
3. Family by family: the counterparts, then the vulnerable operations, with `test/scenarios/<family>.int-spec.ts`, the documentation module and the Postman requests. The pins go in with the first family (AC6, AC7, AC8, AC10).
4. The other safe operations and `safe.int-spec.ts` (AC2 to AC5).
5. The catalogue file (AC9), then everything of AC11 and AC12, and the report.

Skeleton of a vulnerable file, `apps/trading/src/trades/fees-paid.resolver.ts`:

```ts
@Resolver()
export class FeesPaidResolver {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Query(() => DecimalScalar)
  async feesPaid(
    @UserId() caller: string,
    @Args('symbol', { type: () => String }) symbol: string,
  ): Promise<string> {
    // SQL-006 / CWE-89: the string is built before execute(): no placeholder, no parameter
    const [rows] = await this.dataSource.query(`SELECT … WHERE userId = '${caller}' AND symbol = '${symbol}'`);
    …
  }
}
```

Bodies adapt. The shape is load-bearing: one operation, one file, the marker on the vulnerable line.

## 10. Open questions

None. The service specification settles the contract; where it is silent the decisions above apply and section 13 records what the build changed.

## 11. Run log protocol

`.zazz/ephemeral/002b-trading-report.md`: steps completed with the commands and their exit codes, deviations, what was not done. Append-only.

## 12. Agent implementation prompt

```text
You are building the trading service of vuln-nestjs, a deliberately vulnerable NestJS lab.
Worktree: /Users/michael/Dev/zazzcode/vuln-nestjs-wt/trading — every command and file path is inside it.
Branch: phase-2b-trading. Commit and push there only. Never merge.
Specification: .zazz/specifications/002b-trading.md. Read it, then its section 1, and nothing else whole.
Tracking: none. Keep .zazz/ephemeral/002b-trading-report.md current; it is your final report.
Work alone. Run only this service's tests, and pnpm lint, build, format:check.
Halt on: a change outside section 3; the service's tests that cannot pass.
Order: section 9. Verify each AC with what it cites. Then run the verifier prompt below and write the report.
VERIFIER: "You are verifying the trading service in /Users/michael/Dev/zazzcode/vuln-nestjs-wt/trading.
Read .zazz/specifications/002b-trading.md. For each AC, run what it cites. Do not modify code.
Return PASS/FAIL per AC with evidence."
```

## 13. Implementation and review change log

**2026-11-27, the build.** The counts of D-8 held exactly: 31 safe operations built (29 counterparts, `orders`, `cancelOrder`), 20 vulnerable ones, 21 scenarios. What the build changed or found:

- **ACCESS-010's `PUT /internal/orders/:id` whitelists by name, not by a DTO pipe.** The foundation's `EnvironmentModule` registers a global `ValidationPipe` with `forbidNonWhitelisted`, so a route-level whitelist pipe still answers 400 to extra properties. The route reads `body.memo` by name and nothing else of the body, which keeps the tested claim ("200, only `memo` is written; `OPEN` and `u-alice` stay") and the baseline's allowlist-of-names pattern; a silently stripping route cannot exist beside the global pipe.
- **`updateOrder`'s refusal happens at the GraphQL schema, before class-validator.** Apollo's variable coercion rejects the payload with `BAD_USER_INPUT` and "Field \"status\" is not defined by type \"UpdateOrderInput\"" — the same claim the scenario makes, one layer earlier than the validation pipe the plan assumed.
- **An invalid enum value is refused the same way**, by Apollo's variable coercion with `BAD_USER_INPUT` rather than `GRAPHQL_VALIDATION_FAILED` (SQL-003's `marketsByAssets`, SQL-004's `trades(orderBy)`).
- **Every `@InputType` field carries a class-validator decorator**, because the same global whitelist pipe would otherwise refuse the field itself (`PlaceOrderInput.quantity` was caught by exactly that).
- **`convertExact`'s rounding is proven with USD 8.205**, a half cent that rounds half up to 8.21: the shared `Decimal` scalar caps input at eight fractional digits, so a coin amount has nothing to round at its own scale.
- **The Postman collection carries one request per scenario, and the two races carry their end-state assertions in Vitest only**, as the testing strategy's Newman section prescribes; the collection's scripts say so next to the requests they belong to.
- **The skeleton's order-count expectations follow the seed.** The tests of section 7 were kept as written, but `app.int-spec.ts`'s caller's-orders expectations and the collection's skeleton request each knew one order per caller where the seed gives two (Alice 1 and 6, Bob 2 and 7); the expectations were updated to the seed, the queries were not.
- **Cross-branch, for the lead:** `postman/gateway/`'s skeleton request "A query answered from three services" expects Alice's orders to be `[{id: "1"}]`; the trading seed gives her orders 1 and 6. The file belongs to the gateway builder, so it was left alone and `pnpm test:api` fails on that one request on this branch. Everything else in the run passes, including the whole trading collection.

**2026-11-27, after the review** (two axes, standards and this specification: no blocking finding, eleven optional ones; two are closed here, the rest are left to the owner's discretion and listed in the pull request):

- **`buyAtMarket` no longer computes a slippage ceiling.** The build had `min(reference, reference × 1.02)`, which is always the reference: a control that could not bind, under a comment and a documentation line that said it did. Both now say what the code does: the buy pays the reference price, nothing added. The contract's "with a maximum slippage" is met by never moving the price. The LOGIC-003 counterpart test is unchanged.
- **RES-002's second counterpart, `tradesNamed`, pages by a capped offset, not by a cursor** as the contract's row says. Section 8 asks for pages of at most 200, which is what was built; the review found the departure recorded nowhere.

Not built, by D-8: `market(symbol)`, `orderBook(symbol)`, `prices(symbol, limit)`, `User.wallets`, `User.trades`, `User.ledger`, `GET /internal/reports`. With them the counts would be 38 safe and 20 vulnerable (1.9); as built, 31 and 20 (1.55).

---

*End of specification.*
