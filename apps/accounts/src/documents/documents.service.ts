import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import type { DocumentRecord } from './document.record.js';
import { DocumentsRepository } from './documents.repository.js';
import { UploadsStore } from './uploads.store.js';

/** What an upload may carry: extensions this service can serve, and a size cap. */
export const ALLOWED_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.pdf',
  '.txt',
];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The signatures a checked upload must start with, by extension. */
const SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  '.png': [0x89, 0x50, 0x4e, 0x47],
  '.jpg': [0xff, 0xd8, 0xff],
  '.pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
};

/** The content types the service serves a stored document as. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

/** One upload as the routes answer it: the metadata, never the file itself. */
export interface StoredDocument {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documents: DocumentsRepository,
    private readonly uploads: UploadsStore,
  ) {}

  /** The caller's documents. */
  ofUser(userId: string): Promise<DocumentRecord[]> {
    return this.documents.ofUser(userId);
  }

  /** One document of the caller's own. Another user's id answers as missing. */
  async ownDocument(userId: string, id: string): Promise<DocumentRecord> {
    const record = await this.documents.find(id);
    if (record === null || record.userId !== userId) {
      throw new NotFoundException('No such document');
    }
    return record;
  }

  /**
   * Stores an upload under a generated name: a fresh identifier with the
   * extension the allowlist already accepted. The name the uploader gave is
   * kept as data, and never used to build a path.
   */
  async store(
    userId: string,
    originalName: string,
    contents: Buffer,
    options: { checkSignature: boolean },
  ): Promise<StoredDocument> {
    const extension = extensionOf(originalName);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(
        `A document ends in ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    if (contents.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('A document is at most 5 MB');
    }
    if (options.checkSignature) {
      const signature = SIGNATURES[extension];
      if (
        signature !== undefined &&
        !signature.every((byte, index) => contents[index] === byte)
      ) {
        throw new BadRequestException(
          'The file does not start with the signature its extension claims',
        );
      }
    }
    const storedName = `${crypto.randomUUID()}${extension}`;
    await this.uploads.write(storedName, contents);
    const record: DocumentRecord = {
      _id: `d-${crypto.randomUUID()}`,
      userId,
      storedName,
      originalName,
      mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
      size: contents.length,
      createdAt: new Date(),
    };
    await this.documents.insert(record);
    return toStored(record);
  }

  /** The bytes of the caller's own document, by its id: the name comes from the record. */
  async contentsOf(record: DocumentRecord): Promise<Buffer> {
    const path = await this.uploads.pathOf(record.storedName);
    return readFile(path);
  }

  /**
   * The bytes of the caller's own document, by the name they gave it. The
   * stored name is read from the record, then resolved and checked to stay
   * inside the documents directory before anything is read.
   */
  async contentsByName(
    userId: string,
    originalName: string,
  ): Promise<{
    record: DocumentRecord;
    contents: Buffer;
  } | null> {
    const record = await this.documents.byOriginalName(userId, originalName);
    if (record === null) {
      return null;
    }
    const path = await this.uploads.checkedPathOf(record.storedName);
    if (path === null || (await stat(path).catch(() => null)) === null) {
      return null;
    }
    return { record, contents: await readFile(path) };
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function toStored(record: DocumentRecord): StoredDocument {
  return {
    id: record._id,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
  };
}
