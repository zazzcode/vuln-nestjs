import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  advisoryId,
  asText,
  changesBetween,
  checkAudit,
  differencesBetween,
  normalizeAudit,
  reconcile,
} from './check-audit.mjs';

interface Finding {
  version: string;
  paths: string[];
}

interface Advisory {
  id: number;
  github_advisory_id: string;
  module_name: string;
  title: string;
  severity: string;
  findings: Finding[];
}

const advisory = (
  id: number,
  github: string,
  module: string,
  findings: Finding[],
): Advisory => ({
  id,
  github_advisory_id: github,
  module_name: module,
  title: `${module}: a weakness`,
  severity: 'moderate',
  findings,
});

const A = advisory(1094729, 'GHSA-aaaa-1111', 'jsonwebtoken', [
  { version: '8.5.1', paths: ['apps__accounts>jsonwebtoken'] },
]);
const B = advisory(1094730, 'GHSA-bbbb-2222', 'node-serialize', [
  { version: '0.0.4', paths: ['apps__accounts>node-serialize'] },
]);
const C = advisory(1094731, 'GHSA-cccc-3333', 'lodash', [
  {
    version: '4.17.20',
    paths: [
      'apps__accounts>lodash',
      'apps__accounts>@nestjs/apollo>lodash.omit',
    ],
  },
]);

const auditOf = (...advisories: Advisory[]) => ({
  advisories: Object.fromEntries(
    advisories.map((advisory) => [String(advisory.id), advisory]),
  ),
  metadata: { vulnerabilities: { moderate: advisories.length } },
});

/** What the audit command returns: a nonzero exit with advisories in it. */
const auditAnswering = (parsed: unknown) => async () => ({
  code: 1,
  stdout: `${JSON.stringify(parsed)}\n`,
  stderr: '',
});

describe('the audit output in one fixed order', () => {
  test('sorts the findings and the paths, so that only content is compared', () => {
    // The same audit twice, with the findings and the paths in the opposite order.
    const withFindings = (findings: Finding[]) =>
      auditOf({ ...A, findings }, B, C);
    const forward = withFindings([
      {
        version: '8.1.0',
        paths: [
          'apps__accounts>a>jsonwebtoken',
          'apps__accounts>z>jsonwebtoken',
        ],
      },
      { version: '8.5.1', paths: ['apps__accounts>jsonwebtoken'] },
    ]);
    const backward = withFindings([
      { version: '8.5.1', paths: ['apps__accounts>jsonwebtoken'] },
      {
        version: '8.1.0',
        paths: [
          'apps__accounts>z>jsonwebtoken',
          'apps__accounts>a>jsonwebtoken',
        ],
      },
    ]);

    expect(asText(normalizeAudit(backward))).toBe(
      asText(normalizeAudit(forward)),
    );
    expect(
      normalizeAudit(backward).advisories['1094729'].findings.map(
        (finding: Finding) => [finding.version, ...finding.paths],
      ),
    ).toEqual([
      [
        '8.1.0',
        'apps__accounts>a>jsonwebtoken',
        'apps__accounts>z>jsonwebtoken',
      ],
      ['8.5.1', 'apps__accounts>jsonwebtoken'],
    ]);
    // An advisory is kept under the number the audit gives it, in that order.
    expect(Object.keys(normalizeAudit(auditOf(C, A, B)).advisories)).toEqual([
      '1094729',
      '1094730',
      '1094731',
    ]);
  });

  test('keeps the retirements with the snapshot, each once', () => {
    expect(
      normalizeAudit(auditOf(), [
        'GHSA-zzzz-9999',
        'GHSA-aaaa-1111',
        'GHSA-aaaa-1111',
      ]).retired,
    ).toEqual(['GHSA-aaaa-1111', 'GHSA-zzzz-9999']);
    expect(normalizeAudit(auditOf()).retired).toEqual([]);
  });

  test('calls an advisory by its GitHub ID', () => {
    expect(advisoryId(A)).toBe('GHSA-aaaa-1111');
    expect(advisoryId({ ...B, github_advisory_id: undefined })).toBe(
      'node-serialize#1094730',
    );
  });
});

describe('what changed between two audits', () => {
  test('names the advisories that appeared and those that are no longer reported', () => {
    expect(
      changesBetween(
        normalizeAudit(auditOf(A, B)),
        normalizeAudit(auditOf(B, C)),
      ),
    ).toEqual({
      added: ['GHSA-cccc-3333'],
      removed: ['GHSA-aaaa-1111'],
    });
    expect(
      changesBetween(normalizeAudit(auditOf(A)), normalizeAudit(auditOf(A))),
    ).toEqual({ added: [], removed: [] });
  });

  test('says, one line each, what differs beyond an advisory coming or going', () => {
    const counted = (dependencies: number) =>
      normalizeAudit(auditOf(A), [], { dependencies });
    const retitled = auditOf({
      ...A,
      title: 'jsonwebtoken: a worse weakness than was thought',
    });

    expect(
      differencesBetween(
        counted(514),
        normalizeAudit(retitled, [], { dependencies: 512 }),
      ),
    ).toEqual([
      'Changed: GHSA-aaaa-1111. Compare the JSON.',
      "The audit's dependencies moved: 514 → 512",
    ]);
    expect(
      differencesBetween(normalizeAudit(auditOf()), {
        ...normalizeAudit(auditOf()),
        writtenByHand: true,
      }),
    ).toEqual([
      'Compare the JSON with the audit: no advisory and no count differs.',
    ]);
  });
});

describe('letting an advisory go', () => {
  test('a new advisory needs no permission: it becomes a finding the scanner must report', () => {
    const decision = reconcile(
      normalizeAudit(auditOf(A)),
      normalizeAudit(auditOf(A, B)),
    );

    expect(decision.refused).toEqual([]);
    expect(decision.added).toEqual(['GHSA-bbbb-2222']);
    expect(decision.retired).toEqual([]);
  });

  // The answer key must never lose a finding unnoticed.
  test('an advisory that is no longer reported is refused unless it was retired by name', () => {
    const unnamed = reconcile(
      normalizeAudit(auditOf(A, B)),
      normalizeAudit(auditOf(B)),
    );

    expect(unnamed.refused).toEqual([
      'The audit no longer reports GHSA-aaaa-1111. If that is intended, retire it by name: pnpm audit:update --retire GHSA-aaaa-1111',
    ]);

    const named = reconcile(
      normalizeAudit(auditOf(A, B)),
      normalizeAudit(auditOf(B)),
      ['GHSA-aaaa-1111'],
    );

    expect(named.refused).toEqual([]);
    expect(named.retired).toEqual(['GHSA-aaaa-1111']);
    expect(named.removed).toEqual(['GHSA-aaaa-1111']);
  });

  test('names an advisory that is still reported: there is nothing to retire', () => {
    expect(
      reconcile(normalizeAudit(auditOf(A)), normalizeAudit(auditOf(A)), [
        'GHSA-aaaa-1111',
      ]).refused,
    ).toEqual([
      'GHSA-aaaa-1111 is still reported by the audit: there is nothing to retire.',
    ]);
  });

  test('keeps earlier retirements, and drops one whose advisory is reported again', () => {
    const snapshot = normalizeAudit(auditOf(A), [
      'GHSA-cccc-3333',
      'GHSA-bbbb-2222',
    ]);

    const decision = reconcile(snapshot, normalizeAudit(auditOf(A, B)));

    expect(decision.refused).toEqual([]);
    expect(decision.retired).toEqual(['GHSA-cccc-3333']);
  });
});

describe('the command', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A repository holding a snapshot, or none. */
  function repositoryWith(snapshot?: unknown): string {
    const root = mkdtempSync(path.join(tmpdir(), 'vuln-nestjs-audit-'));
    roots.push(root);
    if (snapshot !== undefined) {
      mkdirSync(path.join(root, 'tests'), { recursive: true });
      writeFileSync(
        path.join(root, 'tests/expected-audit.json'),
        asText(snapshot),
      );
    }
    return root;
  }

  test('passes while the audit says what the snapshot says, whatever the audit exit code was', async () => {
    const snapshot = normalizeAudit(auditOf(A, B), ['GHSA-cccc-3333']);

    const checked = await checkAudit({
      root: repositoryWith(snapshot),
      run: auditAnswering(auditOf(B, A)),
    });

    expect(checked).toEqual({
      written: false,
      problems: [],
      summary:
        'pnpm audit --prod matches the committed snapshot (2 advisories, 1 retired).',
    });
  });

  test('fails, naming a new advisory, and the count of its severity that moved with it', async () => {
    const checked = await checkAudit({
      root: repositoryWith(normalizeAudit(auditOf(A))),
      run: auditAnswering(auditOf(A, C)),
    });

    expect(checked.problems).toEqual([
      'The audit differs from tests/expected-audit.json.',
      'New advisories: GHSA-cccc-3333',
      'The audit\'s vulnerabilities moved: {"moderate":1} → {"moderate":2}',
    ]);
  });

  test('fails, naming an advisory that is no longer reported', async () => {
    const checked = await checkAudit({
      root: repositoryWith(normalizeAudit(auditOf(A, B))),
      run: auditAnswering(auditOf(B)),
    });

    expect(checked.problems).toEqual([
      'The audit differs from tests/expected-audit.json.',
      'No longer reported: GHSA-aaaa-1111',
      'The audit\'s vulnerabilities moved: {"moderate":2} → {"moderate":1}',
    ]);
  });

  // A dependency added or removed moves this count without touching an advisory.
  test('fails, naming a count that moved while no advisory did', async () => {
    const counted = (dependencies: number) =>
      normalizeAudit(auditOf(), [], { dependencies });

    const checked = await checkAudit({
      root: repositoryWith(counted(514)),
      run: auditAnswering(counted(512)),
    });

    expect(checked.problems).toEqual([
      'The audit differs from tests/expected-audit.json.',
      "The audit's dependencies moved: 514 → 512",
    ]);
  });

  test('fails when the snapshot was written by hand, and says that nothing it can name differs', async () => {
    const checked = await checkAudit({
      root: repositoryWith({
        ...normalizeAudit(auditOf(A)),
        reviewedByHand: true,
      }),
      run: auditAnswering(auditOf(A)),
    });

    expect(checked.problems).toEqual([
      'The audit differs from tests/expected-audit.json.',
      'Compare the JSON with the audit: no advisory and no count differs.',
    ]);
  });

  test("fails when an advisory's details changed, and says to compare the JSON", async () => {
    // A copy: the fixtures are shared, and changing one would change the snapshot too.
    const retitled = auditOf({
      ...A,
      title: 'jsonwebtoken: a worse weakness than was thought',
    });

    const checked = await checkAudit({
      root: repositoryWith(normalizeAudit(auditOf(A))),
      run: auditAnswering(retitled),
    });

    expect(checked.problems).toEqual([
      'The audit differs from tests/expected-audit.json.',
      'Changed: GHSA-aaaa-1111. Compare the JSON.',
    ]);
  });

  test('fails when there is no snapshot yet', async () => {
    const checked = await checkAudit({
      root: repositoryWith(),
      run: auditAnswering(auditOf()),
    });

    expect(checked.problems).toEqual([
      'tests/expected-audit.json is missing. Write it with: pnpm audit:update',
    ]);
  });

  test('fails when the audit did not produce JSON, and shows what it said', async () => {
    const checked = await checkAudit({
      root: repositoryWith(normalizeAudit(auditOf())),
      run: async () => ({
        code: 1,
        stdout: '',
        stderr:
          'ERR_PNPM_FETCH_404 : GET https://registry.npmjs.org/-/npm/v1/security/audits',
      }),
    });

    expect(checked.problems).toEqual([
      'The audit did not produce JSON (exit 1).',
      'ERR_PNPM_FETCH_404 : GET https://registry.npmjs.org/-/npm/v1/security/audits',
    ]);
    expect(checked.summary).toBe('The audit could not be read.');
  });

  test('writes the snapshot, with a new advisory in it', async () => {
    const root = repositoryWith(normalizeAudit(auditOf(A)));

    const written = await checkAudit({
      root,
      update: true,
      run: auditAnswering(auditOf(A, B)),
    });

    expect(written).toEqual({
      written: true,
      problems: [],
      summary:
        'Snapshot written: tests/expected-audit.json (2 advisories; audit exit 1; new: GHSA-bbbb-2222).',
    });
    expect(
      JSON.parse(
        readFileSync(path.join(root, 'tests/expected-audit.json'), 'utf8'),
      ).retired,
    ).toEqual([]);
  });

  test('writes a first snapshot where there was none, into a repository without the directory for it', async () => {
    const root = repositoryWith();

    const written = await checkAudit({
      root,
      update: true,
      run: auditAnswering(auditOf()),
    });

    expect(written.written).toBe(true);
    expect(written.summary).toBe(
      'Snapshot written: tests/expected-audit.json (0 advisories; audit exit 1).',
    );
    expect(
      JSON.parse(
        readFileSync(path.join(root, 'tests/expected-audit.json'), 'utf8'),
      ),
    ).toEqual({
      advisories: {},
      metadata: { vulnerabilities: { moderate: 0 } },
      retired: [],
    });
  });

  test('refuses to let an advisory go unnamed, and writes nothing', async () => {
    const root = repositoryWith(normalizeAudit(auditOf(A, B)));

    const refused = await checkAudit({
      root,
      update: true,
      run: auditAnswering(auditOf(B)),
    });

    expect(refused.written).toBe(false);
    expect(refused.problems).toEqual([
      'The audit no longer reports GHSA-aaaa-1111. If that is intended, retire it by name: pnpm audit:update --retire GHSA-aaaa-1111',
    ]);
    expect(
      JSON.parse(
        readFileSync(path.join(root, 'tests/expected-audit.json'), 'utf8'),
      ).advisories,
    ).toHaveProperty('1094729');
  });

  test('lets a named advisory go, and keeps its retirement in the snapshot', async () => {
    const root = repositoryWith(
      normalizeAudit(auditOf(A, B), ['GHSA-cccc-3333']),
    );

    const written = await checkAudit({
      root,
      update: true,
      retire: ['GHSA-aaaa-1111'],
      run: auditAnswering(auditOf(B)),
    });

    expect(written).toEqual({
      written: true,
      problems: [],
      summary:
        'Snapshot written: tests/expected-audit.json (1 advisories; audit exit 1; retired: GHSA-aaaa-1111).',
    });
    const snapshot = JSON.parse(
      readFileSync(path.join(root, 'tests/expected-audit.json'), 'utf8'),
    );
    expect(Object.keys(snapshot.advisories)).toEqual(['1094730']);
    expect(snapshot.retired).toEqual(['GHSA-aaaa-1111', 'GHSA-cccc-3333']);
  });

  test('refuses a retirement that names an advisory still reported', async () => {
    const root = repositoryWith(normalizeAudit(auditOf(A)));

    const refused = await checkAudit({
      root,
      update: true,
      retire: ['GHSA-aaaa-1111'],
      run: auditAnswering(auditOf(A)),
    });

    expect(refused.problems).toEqual([
      'GHSA-aaaa-1111 is still reported by the audit: there is nothing to retire.',
    ]);
  });
});
