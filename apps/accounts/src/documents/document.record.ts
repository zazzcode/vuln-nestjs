import type { Document } from 'mongodb';

/** What the `documents` collection holds: the metadata of an uploaded or seeded file. */
export interface DocumentRecord extends Document {
  _id: string;
  userId: string;
  /** The name the file is stored under, inside the service's own directory. */
  storedName: string;
  /** The name the uploader gave it. Kept as data, never used to build a path in the safe routes. */
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export const DOCUMENTS_COLLECTION = 'documents';
