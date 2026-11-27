import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';

/** The only origins an avatar may be fetched from: the lab's own fake avatar host. */
const ALLOWED_ORIGINS: readonly string[] = ['https://avatars.vcx.exchange'];

/** How long a fetch waits before it gives up. */
const TIMEOUT_MS = 3_000;

/**
 * The client that fetches an avatar on the caller's behalf: an allowlist of
 * origins, redirects not followed, a timeout. Everything else is refused
 * before any request is made.
 */
@Injectable()
export class AvatarClient {
  async fetch(url: string): Promise<{ ok: boolean; status?: number }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false };
    }
    if (
      parsed.protocol !== 'https:' ||
      !ALLOWED_ORIGINS.includes(parsed.origin)
    ) {
      return { ok: false };
    }
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        timeout: TIMEOUT_MS,
      });
      // A redirect is refused, not followed: where it points is not on the allowlist's say-so.
      return {
        ok: response.ok && response.status < 300,
        status: response.status,
      };
    } catch {
      return { ok: false };
    }
  }
}
