import { sessionToken } from '@zazzles/exchange-testing';
import type { LabRun } from './lab.js';

/**
 * A session token for one of the fake users, signed with the secret of the
 * run the lab returned: what the scenario files share.
 */
export function tokenOf(
  lab: () => LabRun,
  sub: string,
  role: 'ADMIN' | 'USER' = 'USER',
): string {
  return sessionToken(lab().secrets.JWT_SECRET, {
    sub,
    sid: `s-${sub}`,
    role,
  });
}
