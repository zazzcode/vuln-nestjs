// Scenario ground truth, generated from catalog/catalog.json and committed:
//
// 1. tests/expected-hashes.json: the SHA-256 of every registered file, the
//    vulnerable one and its protected counterparts. A scenario's source cannot
//    change without the change being seen.
// 2. tests/expected-scanner-findings.json: what a scanner must report, per file,
//    and what it must leave alone.
//
// `pnpm scenario:check` fails when either has drifted from the catalogue, or
// when the catalogue itself is not right. Review the change, then re-snapshot
// with `pnpm scenario:update`.
//
// The catalogue is validated against catalog/catalog.schema.json. The validator
// here reads that file and enforces the keywords it uses, so that the schema is
// the one description of an entry and nothing has to be kept in step with it.
//
// One rule more, from the testing strategy: a request per scenario. Every
// registered scenario has a request named after it under postman/, or the
// catalogue is not right.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..');

/** In the order of the code units: one fixed order for paths and identifiers. */
export const inCodeUnitOrder = (first, second) =>
  first < second ? -1 : first > second ? 1 : 0;

/** Where the scenario IDs are designed. An ID can be registered only if it is designed here. */
export const DESIGNED_IN = '.zazz/project/scenario-catalog.md';

/** Where the Postman collections are: a folder per service, holding that service's collection. */
export const POSTMAN_IN = 'postman';

/** A scenario ID at the start of a table row. */
const DESIGN_ID = /^\| ([A-Z]+-[0-9]{3}) \|/gm;

/** A scenario ID at the start of a request's name. */
const REQUEST_ID = /^([A-Z]+-[0-9]{3})\b/;

/**
 * What the name of an application file must not say. Which operation is which
 * lives in the catalogue; a name in the code would give the answer to a scanner.
 */
const TELLING_NAME = /vuln|unsafe|safe/i;

const read = (root, file) => readFile(path.join(root, file), 'utf8');

// --- Validation, from the schema -------------------------------------------------

/**
 * Checks a value against a schema, for the keywords this repository's schema uses.
 *
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} root The whole schema, which holds the `$defs`.
 * @param {string} at Where `value` sits, for the message. Empty for the whole catalogue.
 * @returns {string[]} What is wrong, each with the path to the value.
 */
export function validateAgainst(value, schema, root, at = '') {
  const where = at || 'the catalogue';
  if (typeof schema.$ref === 'string') {
    const definition = schema.$ref.replace(/^#\/\$defs\//, '');
    return validateAgainst(value, root.$defs?.[definition] ?? {}, root, at);
  }
  if (schema.type !== undefined && !isOfType(value, schema.type)) {
    return [`${where}: expected ${schema.type}, received ${describe(value)}`];
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return [
      `${where}: "${String(value)}" is not one of ${schema.enum.join(', ')}`,
    ];
  }
  if (schema.const !== undefined && value !== schema.const) {
    return [
      `${where}: expected "${String(schema.const)}", received "${String(value)}"`,
    ];
  }
  if (
    schema.pattern !== undefined &&
    typeof value === 'string' &&
    !new RegExp(schema.pattern).test(value)
  ) {
    return [`${where}: "${value}" does not match /${schema.pattern}/`];
  }
  if (
    typeof schema.minLength === 'number' &&
    typeof value === 'string' &&
    value.length < schema.minLength
  ) {
    return [`${where}: shorter than ${schema.minLength} characters`];
  }

  const problems = [];
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        problems.push(`${where}: "${key}" is missing`);
      }
    }
    for (const [key, property] of Object.entries(value)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema === undefined) {
        if (schema.additionalProperties === false) {
          problems.push(`${where}: "${key}" is not a field of an entry`);
        }
      } else {
        const below = at ? `${at}.${key}` : key;
        problems.push(
          ...validateAgainst(property, propertySchema, root, below),
        );
      }
    }
  }
  if (schema.type === 'array') {
    value.forEach((item, index) =>
      problems.push(
        ...validateAgainst(item, schema.items ?? {}, root, `${at}[${index}]`),
      ),
    );
    if (schema.uniqueItems && new Set(value).size !== value.length) {
      problems.push(`${where}: the same entry appears twice`);
    }
  }
  return problems;
}

function isOfType(value, type) {
  switch (type) {
    case 'object':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}

function describe(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return typeof value === 'object'
    ? 'an object'
    : `${typeof value} "${String(value)}"`;
}

// --- The catalogue as a catalogue ------------------------------------------------

/** The protected counterparts of an entry, in order. */
export const counterpartsOf = (entry) => [
  ...(entry.safeControl ? [entry.safeControl] : []),
  ...(entry.safeControls ?? []),
];

/** Every file that must exist for an entry: its own, its counterparts', its documentation and its test. */
export const filesOf = (entry) => [
  entry.source,
  ...counterpartsOf(entry),
  entry.documentation,
  entry.test,
];

/**
 * The scenario IDs designed in the catalogue document, each once, in the order they appear.
 *
 * @param {string} designed The text of the document.
 */
export function designedIds(designed) {
  return [
    ...new Set([...designed.matchAll(DESIGN_ID)].map((match) => match[1])),
  ];
}

/** Every request of a collection, under whatever folders it holds them. */
function requestsIn(items) {
  return items.flatMap((item) =>
    item.request === undefined ? requestsIn(item.item ?? []) : [item],
  );
}

/**
 * The scenario IDs that a request under `postman/` is named after, each once:
 * a request whose name begins with an ID, in any collection, under whatever
 * folder the collection holds it.
 *
 * @param {string} root
 * @returns {Promise<Set<string>>}
 */
export async function requestedIds(root) {
  const folder = path.join(root, POSTMAN_IN);
  const entries = await readdir(folder, { recursive: true }).catch((error) => {
    // No collections at all is every scenario without a request, not a crash.
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const ids = new Set();
  for (const file of entries) {
    if (!file.endsWith('.postman_collection.json')) {
      continue;
    }
    const collection = JSON.parse(
      await readFile(path.join(folder, file), 'utf8'),
    );
    for (const { name } of requestsIn(collection.item ?? [])) {
      const id = typeof name === 'string' ? REQUEST_ID.exec(name) : null;
      if (id !== null) {
        ids.add(id[1]);
      }
    }
  }
  return ids;
}

/**
 * What is wrong with the catalogue beyond its shape: an ID used twice, an ID
 * nobody designed, a weakness registered without a protected counterpart or a
 * hardened value, a registered file that does not exist, an application file
 * whose name says what it is — and, when the requested IDs are given, a
 * scenario with no request named after it.
 *
 * @param {Record<string, any>[]} catalogue
 * @param {string} designed The text the scenario IDs are designed in.
 * @param {(file: string) => Promise<boolean>} exists
 * @param {Set<string>} [requested] The IDs a request under `postman/` is named after.
 * @returns {Promise<string[]>}
 */
export async function problemsIn(catalogue, designed, exists, requested) {
  const problems = [];
  const designedOnce = new Set(designedIds(designed));
  const seen = new Set();

  for (const entry of catalogue) {
    const { id } = entry;
    if (seen.has(id)) {
      problems.push(`${id}: two entries carry this ID`);
    }
    seen.add(id);
    if (!designedOnce.has(id)) {
      problems.push(`${id}: not designed in ${DESIGNED_IN}`);
    }
    if (requested !== undefined && !requested.has(id)) {
      problems.push(`${id}: no request under ${POSTMAN_IN}/ is named after it`);
    }
    // A weakness is never registered alone: it has a protected counterpart, or, being a setting, a hardened value.
    // A dependency version has neither: nothing else in the lab can carry the same library.
    if (
      counterpartsOf(entry).length === 0 &&
      entry.surface !== 'setting' &&
      entry.surface !== 'dependency'
    ) {
      problems.push(`${id}: no protected counterpart`);
    }
    if (entry.surface === 'setting' && entry.hardenedValue === undefined) {
      problems.push(
        `${id}: a setting has no counterpart, so it needs its hardened value`,
      );
    }

    for (const file of filesOf(entry)) {
      if (!(await exists(file))) {
        problems.push(`${id}: ${file} does not exist`);
      }
    }
    for (const file of [entry.source, ...counterpartsOf(entry)]) {
      if (file.split('/').some((segment) => TELLING_NAME.test(segment))) {
        problems.push(
          `${id}: ${file} says in its name what it is. Names in code are neutral`,
        );
      }
    }
  }
  return [...new Set(problems)];
}

// --- Ground truth 1: the registered files and their hashes ------------------------

/** Every file the catalogue registers, once, in order. */
export function registeredFiles(catalogue) {
  return [
    ...new Set(
      catalogue.flatMap((entry) => [entry.source, ...counterpartsOf(entry)]),
    ),
  ].sort(inCodeUnitOrder);
}

/**
 * The SHA-256 of each file, by its path relative to the root.
 *
 * @param {string} root
 * @param {string[]} files
 * @returns {Promise<Record<string, string>>}
 */
export async function hashesOf(root, files) {
  const hashes = {};
  for (const file of files) {
    hashes[file] = createHash('sha256')
      .update(await readFile(path.join(root, file)))
      .digest('hex');
  }
  return hashes;
}

// --- Ground truth 2: what a scanner must report -----------------------------------

export const SCOPE_NOTE =
  'Per-source expectations for scanner evaluations. expectedFinding=true rows must be flagged (a miss is a false negative). expectedFinding=false rows are scoped claims: the file should NOT be flagged for the listed CWE, the flaw it is the registered safe control for; findings for unrelated issues are out of scope for this lab. Regenerate with: pnpm scenario:update';

/**
 * One row for each vulnerable file, which a scanner must report, and one for
 * each protected counterpart, which it must not report for the weakness that
 * counterpart guards against.
 *
 * @param {Record<string, any>[]} catalogue
 */
export function scannerFindingsIn(catalogue) {
  return {
    generatedFrom: 'catalog/catalog.json',
    scopeNote: SCOPE_NOTE,
    sources: catalogue
      .flatMap((entry) => [
        {
          id: entry.id,
          source: entry.source,
          expectedFinding: entry.expectedFinding,
          cwe: entry.cwe,
          scanner: entry.scanner,
        },
        ...counterpartsOf(entry).map((source) => ({
          id: `${entry.id}-safeControl`,
          controlFor: entry.id,
          source,
          expectedFinding: false,
          cwe: entry.cwe,
          scanner: entry.scanner,
        })),
      ])
      .sort(
        (a, b) => a.id.localeCompare(b.id) || a.source.localeCompare(b.source),
      ),
  };
}

// --- The command -----------------------------------------------------------------

/**
 * Compares the committed ground truth with what the catalogue says now, and
 * writes it when `update` is set. Writing is refused while anything is wrong
 * with the catalogue: a snapshot must never capture a mistake.
 *
 * @param {{ update?: boolean, root?: string }} [options]
 * @returns {Promise<{ written: boolean, problems: string[], summary: string }>}
 */
export async function checkScenarios({
  update = false,
  root = repositoryRoot,
} = {}) {
  const problems = [];
  const catalogue = JSON.parse(await read(root, 'catalog/catalog.json'));
  const schema = JSON.parse(await read(root, 'catalog/catalog.schema.json'));
  const designed = await read(root, DESIGNED_IN);

  problems.push(...validateAgainst(catalogue, schema, schema));
  const entries = Array.isArray(catalogue) ? catalogue : [];
  const exists = (file) =>
    readFile(path.join(root, file)).then(
      () => true,
      () => false,
    );
  const requested = await requestedIds(root);
  problems.push(...(await problemsIn(entries, designed, exists, requested)));

  const files = registeredFiles(entries);
  const hashes = {};
  for (const file of files) {
    try {
      Object.assign(hashes, await hashesOf(root, [file]));
    } catch {
      problems.push(`missing on disk: ${file}`);
    }
  }
  const findings = scannerFindingsIn(entries);
  const requestedAmong = entries.filter((entry) =>
    requested.has(entry.id),
  ).length;
  const all = [...new Set(problems)];

  if (update) {
    if (all.length > 0) {
      return {
        written: false,
        problems: all,
        summary: 'Nothing was written: the catalogue is not right.',
      };
    }
    await mkdir(path.join(root, 'tests'), { recursive: true });
    await writeFile(
      path.join(root, 'tests/expected-hashes.json'),
      `${JSON.stringify(hashes, null, 2)}\n`,
    );
    await writeFile(
      path.join(root, 'tests/expected-scanner-findings.json'),
      `${JSON.stringify(findings, null, 2)}\n`,
    );
    return {
      written: true,
      problems: [],
      summary: `Snapshots written: tests/expected-hashes.json (${files.length} files) and tests/expected-scanner-findings.json (${findings.sources.length} rows).`,
    };
  }

  const expectedHashes = JSON.parse(
    await read(root, 'tests/expected-hashes.json'),
  );
  for (const file of Object.keys(expectedHashes)) {
    if (!hashes[file]) {
      all.push(
        `tests/expected-hashes.json lists ${file}, which the catalogue no longer registers`,
      );
    }
  }
  for (const [file, hash] of Object.entries(hashes)) {
    if (expectedHashes[file] !== hash) {
      all.push(
        `${file} changed: expected ${String(expectedHashes[file]).slice(0, 12)}…, the file hashes to ${hash.slice(0, 12)}…`,
      );
    }
  }
  const expectedFindings = JSON.parse(
    await read(root, 'tests/expected-scanner-findings.json'),
  );
  if (JSON.stringify(expectedFindings) !== JSON.stringify(findings)) {
    all.push(
      'tests/expected-scanner-findings.json does not match catalog/catalog.json',
    );
  }

  return {
    written: false,
    problems: all,
    summary:
      `The catalogue is sound; ${entries.length} of ${designedIds(designed).length} designed scenarios are registered; ` +
      `${files.length} registered files match tests/expected-hashes.json; tests/expected-scanner-findings.json matches the catalogue (${findings.sources.length} rows); ` +
      `${requestedAmong} of ${entries.length} registered scenarios have a request under ${POSTMAN_IN}/.`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkScenarios({ update: process.argv.includes('--update') })
    .then(({ written, problems, summary }) => {
      if (problems.length > 0) {
        console.error(
          `FAIL: the scenario ground truth is not right:\n  ${problems.join('\n  ')}`,
        );
        console.error(
          '  Review the change, then re-snapshot with: pnpm scenario:update',
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
