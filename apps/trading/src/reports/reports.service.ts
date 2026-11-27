import {
  BeforeApplicationShutdown,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repository } from 'typeorm';
import { ReportEntity } from './report.entity.js';

/**
 * Where the report files of a run are written. Under this service's own
 * directory, so a download that leaves it is a download of the application's
 * own files and nothing else.
 */
export const REPORTS_DIRECTORY = fileURLToPath(
  new URL('../../reports/files/', import.meta.url),
);

/** Resolves a name under the reports directory, and refuses a path that leaves it. */
export function resolveWithinReports(name: string): string {
  const directory = resolve(REPORTS_DIRECTORY);
  const resolved = resolve(directory, name);
  if (resolved !== directory && !resolved.startsWith(`${directory}/`)) {
    throw new ForbiddenException('A report is read under its own directory');
  }
  return resolved;
}

/** The report files of a run: written at seed time, read by name, removed when the service stops. */
@Injectable()
export class ReportsService implements BeforeApplicationShutdown {
  constructor(
    @InjectRepository(ReportEntity)
    private readonly rows: Repository<ReportEntity>,
  ) {}

  /** A report by its id, for the user it belongs to. */
  async byId(id: number): Promise<ReportEntity | null> {
    return this.rows.findOneBy({ id });
  }

  /** The bytes of one of the caller's reports. The name is the one the service stored with the row. */
  async fileOf(callerId: string, storedName: string): Promise<Buffer> {
    const row = await this.rows.findOneBy({ storedName });
    if (row === null || row.userId !== callerId) {
      throw new NotFoundException(`There is no report ${storedName}`);
    }
    return this.readStored(storedName);
  }

  /** Reads a stored report file by the name the service itself chose. */
  async readStored(storedName: string): Promise<Buffer> {
    return readFile(resolveWithinReports(storedName));
  }

  /** Writes a report file under the run's directory. */
  async write(storedName: string, contents: string): Promise<void> {
    await mkdir(REPORTS_DIRECTORY, { recursive: true });
    await writeFile(join(REPORTS_DIRECTORY, storedName), contents, 'utf8');
  }

  /** Empties the run's directory. Every start begins with no report file of an earlier run. */
  async clearFiles(): Promise<void> {
    await rm(REPORTS_DIRECTORY, { recursive: true, force: true });
  }

  /** The machine is as it was: no report file of this run remains. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.clearFiles();
  }
}
