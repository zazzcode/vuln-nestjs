import type { Document } from 'mongodb';

/** What the `sessions` collection holds. The `_id` is the `sid` a token carries. */
export interface SessionDocument extends Document {
  _id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export const SESSIONS_COLLECTION = 'sessions';
