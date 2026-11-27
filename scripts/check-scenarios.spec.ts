import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  DESIGNED_IN,
  checkScenarios,
  designedIds,
  filesOf,
  hashesOf,
  inCodeUnitOrder,
  problemsIn,
  registeredFiles,
  scannerFindingsIn,
  validateAgainst,
} from './check-scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(path.join(here, '../catalog/catalog.schema.json'), 'utf8'),
);

/** A valid entry, as a service's builder writes one. */
const entry = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 'SQL-003',
  title: 'LIKE pattern built from search text',
  status: 'active',
  scanner: 'SAST',
  cwe: 'CWE-89',
  owasp: { top10: 'A03', api: 'API3' },
  service: 'trading',
  surface: 'graphql',
  operation: 'searchMarkets(q: String!)',
  source: 'apps/lab/src/markets/search.resolver.ts',
  flow: "args.q → MarketService.search → queryBuilder.andWhere(`name LIKE '%${q}%'`)",
  safeControl: 'apps/lab/src/markets/markets.resolver.ts',
  safeControls: ['apps/lab/src/markets/markets-by-assets.resolver.ts'],
  documentation: 'docs/vulnerabilities/sql.md',
  test: 'apps/lab/test/scenarios/sql.int-spec.ts',
  expectedFinding: true,
  ...overrides,
});

const designed = [
  '| ID | Scenario | Vulnerable operation | OWASP |',
  '| --- | --- | --- | --- |',
  '| SQL-003 | LIKE pattern concatenated | `searchMarkets` | A03 |',
  '| SQL-004 | Caller-controlled sort column | `tradesSorted` | A03 |',
  '| CONFIG-004 | A debug endpoint returns the environment | `GET /api/v1/debug` | A05 |',
].join('\n');

const present = async () => true;

describe('the schema', () => {
  test('accepts an entry written the way the catalogue document shows one', () => {
    expect(validateAgainst([entry()], schema, schema)).toEqual([]);
  });

  test('names the field that is missing or not part of an entry', () => {
    const missing = entry();
    delete missing.source;
    expect(validateAgainst([missing], schema, schema)).toEqual([
      '[0]: "source" is missing',
    ]);

    const invented = entry({ likely: true });
    expect(validateAgainst([invented], schema, schema)).toEqual([
      '[0]: "likely" is not a field of an entry',
    ]);
  });

  test("refuses an identifier, a surface or a category that is not of the catalogue's form", () => {
    expect(validateAgainst([entry({ id: 'sql-3' })], schema, schema)).toEqual([
      '[0].id: "sql-3" does not match /^[A-Z]+-[0-9]{3}$/',
    ]);
    expect(
      validateAgainst([entry({ surface: 'web' })], schema, schema),
    ).toEqual([
      '[0].surface: "web" is not one of graphql, rest, setting, dependency',
    ]);
    expect(
      validateAgainst([entry({ owasp: { top10: 'A3' } })], schema, schema),
    ).toEqual(['[0].owasp.top10: "A3" does not match /^A[0-9]{2}$/']);
    expect(
      validateAgainst([entry({ expectedFinding: 'yes' })], schema, schema),
    ).toEqual(['[0].expectedFinding: expected boolean, received string "yes"']);
  });

  test('refuses the catalogue that is not a list', () => {
    expect(validateAgainst({ id: 'SQL-003' }, schema, schema)).toEqual([
      'the catalogue: expected array, received an object',
    ]);
  });
});

describe('the catalogue as a catalogue', () => {
  test('takes an ID only from the designed ones, once', async () => {
    expect(await problemsIn([entry(), entry()], designed, present)).toEqual([
      'SQL-003: two entries carry this ID',
    ]);
    expect(
      await problemsIn([entry({ id: 'SQL-009' })], designed, present),
    ).toEqual([`SQL-009: not designed in ${DESIGNED_IN}`]);
    expect(designedIds(designed)).toEqual(['SQL-003', 'SQL-004', 'CONFIG-004']);
  });

  // A weakness is never registered alone: its protected counterpart is what a false positive is measured against.
  test('refuses a weakness without a protected counterpart, unless nothing else can carry it', async () => {
    const alone = entry();
    delete alone.safeControl;
    delete alone.safeControls;
    expect(await problemsIn([alone], designed, present)).toEqual([
      'SQL-003: no protected counterpart',
    ]);

    const setting = entry({
      id: 'CONFIG-004',
      surface: 'setting',
      source: 'apps/lab/src/debug.controller.ts',
    });
    delete setting.safeControl;
    delete setting.safeControls;
    expect(await problemsIn([setting], designed, present)).toEqual([
      'CONFIG-004: a setting has no counterpart, so it needs its hardened value',
    ]);
    expect(
      await problemsIn(
        [{ ...setting, hardenedValue: 'admin only, allowlisted keys' }],
        designed,
        present,
      ),
    ).toEqual([]);

    const dependency = entry({
      id: 'SCA-001',
      scanner: 'SCA',
      surface: 'dependency',
      source: 'apps/lab/package.json',
    });
    delete dependency.safeControl;
    delete dependency.safeControls;
    expect(
      await problemsIn(
        [dependency],
        '## `SCA`\n\n| ID | Version | Workspace |\n| --- | --- | --- |\n| SCA-001 | `jsonwebtoken` 8.5.1 | `apps/accounts` |',
        present,
      ),
    ).toEqual([]);
  });

  test('refuses a registered file that does not exist', async () => {
    const exists = (file: string) =>
      Promise.resolve(file !== 'docs/vulnerabilities/sql.md');

    expect(await problemsIn([entry()], designed, exists)).toEqual([
      'SQL-003: docs/vulnerabilities/sql.md does not exist',
    ]);
    expect(filesOf(entry())).toHaveLength(5);
  });

  // The answer key is the catalogue. A file named for what it is would hand the answer to a scanner.
  test('refuses an application file that says in its name what it is, and leaves the documentation alone', async () => {
    expect(
      await problemsIn(
        [
          entry({
            safeControls: ['apps/lab/src/markets/markets.safe.resolver.ts'],
          }),
        ],
        designed,
        present,
      ),
    ).toEqual([
      'SQL-003: apps/lab/src/markets/markets.safe.resolver.ts says in its name what it is. Names in code are neutral',
    ]);
    expect(
      await problemsIn(
        [
          entry({
            source: 'apps/lab/src/orders/unsafe-order-lookup.resolver.ts',
          }),
        ],
        designed,
        present,
      ),
    ).toEqual([
      'SQL-003: apps/lab/src/orders/unsafe-order-lookup.resolver.ts says in its name what it is. Names in code are neutral',
    ]);
    // The documentation is where the answer is meant to be.
    expect(await problemsIn([entry()], designed, present)).toEqual([]);
  });
});

describe('the ground truth made from the catalogue', () => {
  const catalogue = [
    entry(),
    entry({
      id: 'SQL-004',
      title: 'Caller-controlled sort column',
      operation: 'tradesSorted(symbol, sortBy, sortDir)',
      source: 'apps/lab/src/trades/trades.sorted.resolver.ts',
      safeControl: 'apps/lab/src/trades/trades.resolver.ts',
      safeControls: [],
    }),
  ];

  test('registers every vulnerable file and every counterpart, once', () => {
    expect(registeredFiles(catalogue)).toEqual([
      'apps/lab/src/markets/markets-by-assets.resolver.ts',
      'apps/lab/src/markets/markets.resolver.ts',
      'apps/lab/src/markets/search.resolver.ts',
      'apps/lab/src/trades/trades.resolver.ts',
      'apps/lab/src/trades/trades.sorted.resolver.ts',
    ]);
  });

  test('says which files a scanner must report and which it must leave alone', () => {
    const { sources } = scannerFindingsIn(catalogue);

    expect(
      sources.map((row: { id: string; expectedFinding: boolean }) => [
        row.id,
        row.expectedFinding,
      ]),
    ).toEqual([
      ['SQL-003', true],
      ['SQL-003-safeControl', false],
      ['SQL-003-safeControl', false],
      ['SQL-004', true],
      ['SQL-004-safeControl', false],
    ]);
    // A file left alone is a scoped claim: for the weakness it is the counterpart of, and for nothing else.
    expect(
      sources.find(
        (row: { source: string }) =>
          row.source === 'apps/lab/src/markets/markets.resolver.ts',
      ),
    ).toEqual({
      id: 'SQL-003-safeControl',
      controlFor: 'SQL-003',
      source: 'apps/lab/src/markets/markets.resolver.ts',
      expectedFinding: false,
      cwe: 'CWE-89',
      scanner: 'SAST',
    });
    expect(scannerFindingsIn(catalogue).scopeNote).toMatch(/scoped claims/);
  });

  test('hashes a file by its content', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vuln-nestjs-hash-'));
    try {
      mkdirSync(path.join(root, 'a'), { recursive: true });
      writeFileSync(path.join(root, 'a/one.ts'), 'export const one = 1;\n');
      writeFileSync(path.join(root, 'a/two.ts'), 'export const one = 1;\n');

      const hashes = await hashesOf(root, ['a/one.ts', 'a/two.ts']);

      expect(hashes['a/one.ts']).toMatch(/^[0-9a-f]{64}$/);
      expect(hashes['a/two.ts']).toBe(hashes['a/one.ts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the command', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A small repository holding a catalogue and the files it registers. */
  function repositoryWith(
    catalogue: unknown[],
    { omit = '', contentOf = (_file: string) => 'export {};\n' } = {},
  ): string {
    const root = mkdtempSync(path.join(tmpdir(), 'vuln-nestjs-catalogue-'));
    roots.push(root);
    const write = (file: string, content: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };
    cpSync(
      path.join(here, '../catalog/catalog.schema.json'),
      path.join(root, 'catalog/catalog.schema.json'),
      { recursive: true },
    );
    write('catalog/catalog.json', `${JSON.stringify(catalogue, null, 2)}\n`);
    write(DESIGNED_IN, `${designed}\n`);
    for (const file of catalogue.flatMap(filesOf).sort(inCodeUnitOrder)) {
      if (file !== omit) {
        write(file, contentOf(file));
      }
    }
    return root;
  }

  test('writes both snapshots, then passes', async () => {
    const root = repositoryWith([entry()]);

    const written = await checkScenarios({ update: true, root });

    expect(written).toEqual({
      written: true,
      problems: [],
      summary:
        'Snapshots written: tests/expected-hashes.json (3 files) and tests/expected-scanner-findings.json (3 rows).',
    });
    expect(
      Object.keys(
        JSON.parse(
          readFileSync(path.join(root, 'tests/expected-hashes.json'), 'utf8'),
        ),
      ),
    ).toEqual(registeredFiles([entry()]));
    expect(
      JSON.parse(
        readFileSync(
          path.join(root, 'tests/expected-scanner-findings.json'),
          'utf8',
        ),
      ).sources,
    ).toHaveLength(3);

    const checked = await checkScenarios({ root });

    expect(checked.problems).toEqual([]);
    expect(checked.summary).toBe(
      'The catalogue is sound; 1 of 3 designed scenarios are registered; 3 registered files match tests/expected-hashes.json; tests/expected-scanner-findings.json matches the catalogue (3 rows).',
    );
  });

  test('will not snapshot a catalogue that is not right', async () => {
    const root = repositoryWith([entry()], {
      omit: 'docs/vulnerabilities/sql.md',
    });

    const written = await checkScenarios({ update: true, root });

    expect(written.written).toBe(false);
    expect(written.problems).toEqual([
      'SQL-003: docs/vulnerabilities/sql.md does not exist',
    ]);
  });

  test('fails when a registered file changed, and passes again once re-snapshotted', async () => {
    const root = repositoryWith([entry()]);
    await checkScenarios({ update: true, root });

    writeFileSync(
      path.join(root, 'apps/lab/src/markets/search.resolver.ts'),
      'export const changed = true;\n',
    );
    const drifted = await checkScenarios({ root });

    expect(drifted.problems).toHaveLength(1);
    expect(drifted.problems[0]).toMatch(
      /^apps\/lab\/src\/markets\/search\.resolver\.ts changed: expected [0-9a-f]{12}…, the file hashes to [0-9a-f]{12}…$/,
    );
    expect((await checkScenarios({ update: true, root })).written).toBe(true);
    expect((await checkScenarios({ root })).problems).toEqual([]);
  });

  test('fails when the committed findings were edited by hand', async () => {
    const root = repositoryWith([entry()]);
    await checkScenarios({ update: true, root });
    const findingsPath = path.join(
      root,
      'tests/expected-scanner-findings.json',
    );
    const edited = JSON.parse(readFileSync(findingsPath, 'utf8'));
    edited.sources[0].expectedFinding = false;
    writeFileSync(findingsPath, `${JSON.stringify(edited, null, 2)}\n`);

    const checked = await checkScenarios({ root });

    expect(checked.problems).toEqual([
      'tests/expected-scanner-findings.json does not match catalog/catalog.json',
    ]);
  });

  test('fails when the snapshot lists a file the catalogue no longer registers', async () => {
    const root = repositoryWith([entry()]);
    await checkScenarios({ update: true, root });
    const hashesPath = path.join(root, 'tests/expected-hashes.json');
    const hashes = JSON.parse(readFileSync(hashesPath, 'utf8'));
    hashes['apps/lab/src/gone.resolver.ts'] = '0'.repeat(64);
    writeFileSync(hashesPath, `${JSON.stringify(hashes, null, 2)}\n`);

    const checked = await checkScenarios({ root });

    expect(checked.problems).toEqual([
      'tests/expected-hashes.json lists apps/lab/src/gone.resolver.ts, which the catalogue no longer registers',
    ]);
  });

  test('passes for the committed catalogue', async () => {
    const checked = await checkScenarios();

    expect(checked.problems).toEqual([]);
    // What is registered is what the catalogue holds: an entry per scenario
    // built so far, a hash per file an entry names, a row per finding. The
    // designed count is the application scenarios and the dependency pins.
    const committed = (file) =>
      JSON.parse(readFileSync(path.join(here, '..', file), 'utf8'));
    const catalogue = committed('catalog/catalog.json');
    const designedCount = designedIds(
      readFileSync(path.join(here, '..', DESIGNED_IN), 'utf8'),
    ).length;
    const rows = committed('tests/expected-scanner-findings.json').sources
      .length;
    expect(checked.summary).toBe(
      `The catalogue is sound; ${catalogue.length} of ${designedCount} designed scenarios are registered; ` +
        `${registeredFiles(catalogue).length} registered files match tests/expected-hashes.json; ` +
        `tests/expected-scanner-findings.json matches the catalogue (${rows} rows).`,
    );
  });
});
