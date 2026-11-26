import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** The database engines the lab starts, by process name. */
const ENGINES = ['mongod', 'mysqld'] as const;

/** The database processes and temporary directories that exist right now. */
export interface DatabaseFootprint {
  processes: { pid: number; name: string }[];
  directories: string[];
}

export async function databaseFootprint(): Promise<DatabaseFootprint> {
  const processes = (await Promise.all(ENGINES.map(list))).flat();
  return { processes, directories: temporaryDirectories() };
}

/** Throws if anything exists now that did not when the footprint was taken: the lab did not stop cleanly. */
export async function assertFootprintGone(
  before: DatabaseFootprint,
  graceMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + graceMs;
  for (;;) {
    const left = await leftoverOf(before);
    if (left.length === 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `The lab did not stop cleanly. Left behind: ${left.join('; ')}`,
      );
    }
    await delay(100);
  }
}

async function leftoverOf(before: DatabaseFootprint): Promise<string[]> {
  const after = await databaseFootprint();
  const knownProcesses = new Set(
    before.processes.map((process) => process.pid),
  );
  const knownDirectories = new Set(before.directories);
  return [
    ...after.processes
      .filter((process) => !knownProcesses.has(process.pid))
      .map((process) => `process ${process.name} (${process.pid})`),
    ...after.directories
      .filter((directory) => !knownDirectories.has(directory))
      .map((directory) => `directory ${directory}`),
  ];
}

/**
 * What one run leaves under the system's temporary directory if it does not
 * stop cleanly. mongodb-memory-server creates `<tmpdir>/mongo-mem-XXXXXX` and
 * mysql-memory-server `<tmpdir>/mysqlmsn/dbs/<id>`. The binaries the packages
 * cache are not listed: those stay, and are reused.
 */
function temporaryDirectories(): string[] {
  const inside = (directory: string): string[] => {
    try {
      return readdirSync(directory).map((entry) => join(directory, entry));
    } catch {
      return [];
    }
  };
  return [
    ...inside(tmpdir()).filter((entry) =>
      entry.startsWith(join(tmpdir(), 'mongo-mem-')),
    ),
    ...inside(join(tmpdir(), 'mysqlmsn', 'dbs')),
  ].sort();
}

async function list(name: string): Promise<{ pid: number; name: string }[]> {
  try {
    const { stdout } = await execute('pgrep', ['-x', name]);
    return stdout
      .trim()
      .split('\n')
      .filter((pid) => pid !== '')
      .map((pid) => ({ pid: Number(pid), name }));
  } catch {
    // pgrep exits with 1 when no such process runs.
    return [];
  }
}
