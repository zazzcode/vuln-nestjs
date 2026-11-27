import type { Document } from 'mongodb';
import { Role } from './user.model.js';

/** What the `users` collection holds: a plain document whose `_id` is the user's fixed identifier. */
export interface UserDocument extends Document {
  _id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
}

export const USERS_COLLECTION = 'users';
