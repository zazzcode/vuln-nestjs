import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns';

/** What the guard says about one URL. A refusal carries its reason, which names the rule that refused. */
export type OutboundDecision =
  { allowed: true } | { allowed: false; reason: string };

/** Resolves a host to its addresses. Injectable so a test never resolves a name. */
export type HostLookup = (host: string) => Promise<string[]>;

const loopbackAddressesOf: HostLookup = (host) =>
  new Promise((resolve, reject) => {
    lookup(host, { all: true }, (error, addresses) =>
      error === null
        ? resolve(addresses.map((address) => address.address))
        : reject(error),
    );
  });

function isLoopback(address: string): boolean {
  const bare = address.startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address;
  return bare === '::1' || bare.startsWith('127.');
}

/** The same origin, spelled the way `URL` spells it, so the comparison is a string comparison. */
function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * The outbound guard: nothing leaves this service to a URL that is not on the
 * allowlist. The scheme must be `http` or `https`, the origin must be one of
 * `WEBHOOK_ALLOWED_ORIGINS` compared as a string, and the host must resolve
 * to a loopback address. The allowlist is compared before any name is
 * resolved, so a refused origin costs no lookup at all.
 */
@Injectable()
export class OutboundGuardService {
  private readonly origins: readonly string[];

  constructor(
    origins: Iterable<string>,
    private readonly lookup: HostLookup = loopbackAddressesOf,
  ) {
    this.origins = [...origins]
      .map((origin) => originOf(origin))
      .filter((origin): origin is string => origin !== null);
  }

  /** Every rule but the name resolution. Resolves nothing. */
  decisionFor(url: string): OutboundDecision {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        allowed: false,
        reason: `refused: not an absolute http or https URL: ${url}`,
      };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        allowed: false,
        reason: `refused: the scheme ${parsed.protocol.replace(':', '')} is not http or https`,
      };
    }
    if (!this.origins.includes(parsed.origin)) {
      return {
        allowed: false,
        reason: `refused: the origin ${parsed.origin} is not on the webhook allowlist`,
      };
    }
    return { allowed: true };
  }

  /** Adds the resolution: the host must resolve to a loopback address, and nothing else. */
  async check(url: string): Promise<OutboundDecision> {
    const decided = this.decisionFor(url);
    if (!decided.allowed) {
      return decided;
    }
    const host = new URL(url).hostname;
    const addresses = await this.lookup(host).catch(() => null);
    if (addresses === null || addresses.length === 0) {
      return {
        allowed: false,
        reason: `refused: the host ${host} does not resolve`,
      };
    }
    if (!addresses.every(isLoopback)) {
      return {
        allowed: false,
        reason: `refused: the host ${host} does not resolve to a loopback address`,
      };
    }
    return { allowed: true };
  }
}
