import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/**
 * Where uploaded and seeded files live: a directory the service creates under
 * the system's temporary directory when it starts and removes when it stops.
 * Nothing outside it is written by the safe routes, and nothing survives the
 * run.
 */
@Injectable()
export class UploadsStore implements BeforeApplicationShutdown {
  private root?: string;
  private opened?: Promise<{ root: string; documents: string }>;

  /** The root and its `documents` subdirectory, created on first use. */
  open(): Promise<{ root: string; documents: string }> {
    this.opened ??= this.start();
    return this.opened;
  }

  async pathOf(storedName: string): Promise<string> {
    const { documents } = await this.open();
    return join(documents, storedName);
  }

  /**
   * The path of a stored name, but only when it resolves inside the documents
   * directory. A name that tries to climb out gets nothing.
   */
  async checkedPathOf(storedName: string): Promise<string | null> {
    const { documents } = await this.open();
    const resolved = resolve(documents, storedName);
    return resolved.startsWith(documents + sep) ? resolved : null;
  }

  async write(storedName: string, contents: Buffer): Promise<string> {
    const path = await this.pathOf(storedName);
    writeFileSync(path, contents);
    return path;
  }

  /** Removes everything the service stored, and the directory itself. */
  beforeApplicationShutdown(): void {
    if (this.root) {
      rmSync(this.root, { recursive: true, force: true });
      this.root = undefined;
    }
  }

  private async start(): Promise<{ root: string; documents: string }> {
    this.root = mkdtempSync(join(tmpdir(), 'vcx-accounts-'));
    const documents = join(this.root, 'documents');
    mkdirSync(documents, { recursive: true });
    return { root: this.root, documents };
  }
}

/** The uploads the store starts with, and what the reset puts back. */
export const SEEDED_DOCUMENTS = [
  {
    id: 'd-alice-avatar',
    storedName: 'seed-alice-avatar.png',
    originalName: 'avatar.png',
    mimeType: 'image/png',
    // A 1x1 transparent PNG: real magic bytes, nothing else.
    contents: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  },
  {
    id: 'd-alice-statement',
    storedName: 'seed-alice-statement.pdf',
    originalName: 'statement.pdf',
    mimeType: 'application/pdf',
    contents: Buffer.from('%PDF-1.4\n1 0 object\nendobject\n%%EOF\n'),
  },
] as const;
