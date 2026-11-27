// SCA ground truth: `pnpm audit --prod --json`, normalised, compared with the
// committed snapshot tests/expected-audit.json.
//
// Any difference fails `pnpm audit:check`: a changed dependency, a newly
// published advisory, a changed advisory text. Review the difference, then
// re-snapshot with `pnpm audit:update`.
//
// An advisory may leave the snapshot only by name:
//
//     pnpm audit:update --retire GHSA-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx[,GHSA-…]
//
// so that a finding can never disappear from the answer key unnoticed. Each
// retirement is kept in the snapshot, under "retired". A nonzero audit exit is
// expected while the lab has vulnerable pins; only a snapshot that disagrees
// with the audit, or an audit that cannot run, is a failure.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');
export const snapshotFile = 'tests/expected-audit.json';

/** Runs the audit of the production dependencies. A nonzero exit means it found something, not that it failed to run. */
export function runAudit(cwd = repositoryRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['audit', '--prod', '--json'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** In the order of the code units: one fixed order for paths and identifiers. */
export const inCodeUnitOrder = (first, second) =>
  first < second ? -1 : first > second ? 1 : 0;

/** What an advisory is called by people and by the retire option: its GitHub ID, or, failing that, its package and number. */
export const advisoryId = (advisory) =>
  advisory.github_advisory_id ?? `${advisory.module_name}#${advisory.id}`;

const byVersion = (first, second) =>
  first.version.localeCompare(second.version);

/**
 * The audit output in one fixed order, so that only content is compared and
 * not the order pnpm happens to list things in.
 *
 * @param {Record<string, any>} parsed The audit's JSON.
 * @param {string[]} [retired] The retirements to keep with the snapshot.
 * @param {Record<string, any>} [metadata] The audit's own summary of itself.
 */
export function normalizeAudit(
  parsed,
  retired = [],
  metadata = parsed.metadata,
) {
  /** @type {Record<string, any>} */
  const advisories = {};
  for (const key of Object.keys(parsed.advisories ?? {}).sort(
    (first, second) => Number(first) - Number(second),
  )) {
    const advisory = parsed.advisories[key];
    advisories[key] = {
      ...advisory,
      findings: [...advisory.findings].sort(byVersion).map((finding) => ({
        ...finding,
        paths: [...finding.paths].sort(inCodeUnitOrder),
      })),
    };
  }
  return {
    advisories,
    metadata,
    retired: [...new Set(retired)].sort(inCodeUnitOrder),
  };
}

/**
 * Which advisories a new audit adds and which it no longer reports, by ID.
 *
 * @param {Record<string, any>} snapshot The committed snapshot, normalised.
 * @param {Record<string, any>} audit The new audit, normalised.
 */
export function changesBetween(snapshot, audit) {
  const idsOf = (normalised) =>
    new Set(Object.values(normalised.advisories).map(advisoryId));
  const before = idsOf(snapshot);
  const after = idsOf(audit);
  return {
    added: [...after].filter((id) => !before.has(id)).sort(inCodeUnitOrder),
    removed: [...before].filter((id) => !after.has(id)).sort(inCodeUnitOrder),
  };
}

/**
 * Decides whether an update may go ahead.
 *
 * A new advisory is always welcome: it becomes a finding the scanner must
 * report. An advisory that is no longer reported may only leave the snapshot if
 * it was named with `--retire`; an advisory named with `--retire` must be gone.
 *
 * @param {Record<string, any>} snapshot The committed snapshot, normalised. Empty when there is none yet.
 * @param {Record<string, any>} audit The new audit, normalised.
 * @param {string[]} requested The IDs given with `--retire`.
 * @returns {{ refused: string[], retired: string[], added: string[], removed: string[] }} Why the update is
 *   refused, if it is; the retirements to keep; and what the audit reports differently from the snapshot.
 */
export function reconcile(snapshot, audit, requested = []) {
  const { added, removed } = changesBetween(snapshot, audit);
  const reported = new Set(Object.values(audit.advisories).map(advisoryId));
  const named = new Set(requested);
  const refused = [];

  for (const id of removed) {
    if (!named.has(id)) {
      refused.push(
        `The audit no longer reports ${id}. If that is intended, retire it by name: pnpm audit:update --retire ${id}`,
      );
    }
  }
  for (const id of named) {
    if (reported.has(id)) {
      refused.push(
        `${id} is still reported by the audit: there is nothing to retire.`,
      );
    }
  }
  // An advisory that was retired and is reported again is a finding again.
  const retired = [...new Set([...(snapshot.retired ?? []), ...named])]
    .filter((id) => !reported.has(id))
    .sort(inCodeUnitOrder);
  return { refused, retired, added, removed };
}

/** The snapshot as text, which is what the committed file holds. */
export const asText = (snapshot) => `${JSON.stringify(snapshot, null, 2)}\n`;

/**
 * What differs between the snapshot and the audit, each difference in one line:
 * an advisory that appeared, one that is no longer reported, one whose details
 * changed, or a count of the audit's own that moved. A dependency added or
 * removed moves a count without touching an advisory.
 *
 * @param {Record<string, any>} snapshot The committed snapshot, normalised.
 * @param {Record<string, any>} audit The new audit, normalised.
 * @returns {string[]}
 */
export function differencesBetween(snapshot, audit) {
  const { added, removed } = changesBetween(snapshot, audit);
  const byId = (normalised) =>
    new Map(
      Object.values(normalised.advisories).map((advisory) => [
        advisoryId(advisory),
        advisory,
      ]),
    );
  const before = byId(snapshot);
  const after = byId(audit);
  const changed = [...after.keys()]
    .filter(
      (id) =>
        before.has(id) &&
        JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
    )
    .sort(inCodeUnitOrder);
  const moved = Object.keys(snapshot.metadata ?? {}).filter(
    (key) =>
      JSON.stringify(snapshot.metadata[key]) !==
      JSON.stringify(audit.metadata?.[key]),
  );

  const lines = [
    added.length ? `New advisories: ${added.join(', ')}` : null,
    removed.length ? `No longer reported: ${removed.join(', ')}` : null,
    changed.length ? `Changed: ${changed.join(', ')}. Compare the JSON.` : null,
    ...moved.map(
      (key) =>
        `The audit's ${key} moved: ${JSON.stringify(snapshot.metadata[key])} → ${JSON.stringify(audit.metadata?.[key])}`,
    ),
  ].filter(Boolean);
  // The texts differ and nothing above says why: it is the arrangement of the JSON itself.
  return lines.length > 0
    ? lines
    : ['Compare the JSON with the audit: no advisory and no count differs.'];
}

/**
 * Runs the audit and compares it with the snapshot, writing the snapshot when
 * `update` is set.
 *
 * @param {{ update?: boolean, retire?: string[], root?: string, run?: () => Promise<{ code: number, stdout: string, stderr: string }> }} [options]
 *   `run` produces the audit output; it is replaced in tests, so that they need no network.
 * @returns {Promise<{ written: boolean, problems: string[], summary: string }>}
 */
export async function checkAudit({
  update = false,
  retire = [],
  root = repositoryRoot,
  run = runAudit,
} = {}) {
  const { code, stdout, stderr } = await run(root);
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      written: false,
      problems: [
        `The audit did not produce JSON (exit ${code}).`,
        stdout.slice(0, 400),
        stderr.slice(0, 400),
      ].filter(Boolean),
      summary: 'The audit could not be read.',
    };
  }

  const snapshotPath = path.join(root, snapshotFile);
  const previous = await readFile(snapshotPath, 'utf8').then(
    JSON.parse,
    () => null,
  );
  if (update) {
    const { refused, retired, added, removed } = reconcile(
      previous ?? normalizeAudit({ advisories: {} }),
      normalizeAudit(parsed),
      retire,
    );
    if (refused.length > 0) {
      return {
        written: false,
        problems: refused,
        summary: 'Nothing was written.',
      };
    }
    const snapshot = normalizeAudit(parsed, retired);
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, asText(snapshot));
    const notes = [
      `${Object.keys(snapshot.advisories).length} advisories`,
      `audit exit ${code}`,
      added.length ? `new: ${added.join(', ')}` : null,
      removed.length ? `retired: ${removed.join(', ')}` : null,
    ].filter(Boolean);
    return {
      written: true,
      problems: [],
      summary: `Snapshot written: ${snapshotFile} (${notes.join('; ')}).`,
    };
  }

  if (previous === null) {
    return {
      written: false,
      problems: [
        `${snapshotFile} is missing. Write it with: pnpm audit:update`,
      ],
      summary: 'There is no snapshot.',
    };
  }
  const actual = normalizeAudit(parsed, previous.retired ?? []);
  if (asText(actual) === asText(previous)) {
    return {
      written: false,
      problems: [],
      summary: `pnpm audit --prod matches the committed snapshot (${Object.keys(actual.advisories).length} advisories${(previous.retired ?? []).length ? `, ${(previous.retired ?? []).length} retired` : ''}).`,
    };
  }
  return {
    written: false,
    problems: [
      'The audit differs from tests/expected-audit.json.',
      ...differencesBetween(previous, actual),
    ],
    summary: 'The audit drifted from the snapshot.',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const retireAt = process.argv.indexOf('--retire');
  const retire =
    retireAt === -1
      ? []
      : String(process.argv[retireAt + 1] ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
  checkAudit({ update: process.argv.includes('--update'), retire })
    .then(({ written, problems, summary }) => {
      if (problems.length > 0) {
        console.error(`FAIL: ${summary}\n  ${problems.join('\n  ')}`);
        console.error(
          '  Review the change, then re-snapshot with: pnpm audit:update',
        );
        process.exit(1);
      }
      console.log(`${written ? 'WRITTEN' : 'PASS'}: ${summary}`);
    })
    .catch((error) => {
      console.error(`FAIL: ${error.message}`);
      process.exit(1);
    });
}
