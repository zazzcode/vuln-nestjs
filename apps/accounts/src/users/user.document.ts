import type { Document } from 'mongodb';
import { Role } from './user.model.js';

/** What a user's preferences hold. Strings only, written through typed inputs or allowlisted names. */
export type Preferences = {
  theme: string;
  language: string;
  currency: string;
  marketingEmails: string;
};

/** What the `users` collection holds: a plain document whose `_id` is the user's fixed identifier. */
export interface UserDocument extends Document {
  _id: string;
  email: string;
  displayName: string;
  /** `scrypt$N$r$p$salt$hash`, or a legacy `$sha1$hash` for accounts made before the change. */
  passwordHash: string;
  role: Role;
  preferences: Preferences;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Sign-in lockout: how many attempts have failed, and until when the account is locked. */
  failedAttempts: number;
  lockedUntil: Date | null;
  /** The reset code of the last password request. Kept on the record, never returned to a caller. */
  resetCode: string | null;
}

export const USERS_COLLECTION = 'users';
