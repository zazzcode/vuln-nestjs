import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';
import { Environment } from '../config/environment.js';

/** How long a fetch waits before it gives up. */
const TIMEOUT_MS = 3_000;

/** Why an avatar was not fetched. */
export type AvatarRefusal = 'not-allowlisted' | 'redirect' | 'not-served';

/** What came of a fetch: the status when the avatar was served, the reason when it was not. */
export type AvatarFetch =
  | { ok: true; status: number }
  | { ok: false; reason: AvatarRefusal; status?: number };

/**
 * The client that fetches an avatar on the caller's behalf: an allowlist of
 * origins, redirects not followed, a timeout. Everything else is refused
 * before any request is made.
 */
@Injectable()
export class AvatarClient {
  constructor(private readonly environment: Environment) {}

  async fetch(url: string): Promise<AvatarFetch> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: 'not-allowlisted' };
    }
    // An origin is compared as written, its scheme included: nothing is
    // fetched from a host, a port or a scheme the allowlist does not name.
    if (!this.environment.avatarOrigins.includes(parsed.origin)) {
      return { ok: false, reason: 'not-allowlisted' };
    }
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        timeout: TIMEOUT_MS,
      });
      if (response.ok) {
        return { ok: true, status: response.status };
      }
      // A redirect is refused, not followed: where it points is not on the allowlist's say-so.
      return {
        ok: false,
        status: response.status,
        reason: response.status < 400 ? 'redirect' : 'not-served',
      };
    } catch {
      return { ok: false, reason: 'not-served' };
    }
  }
}
