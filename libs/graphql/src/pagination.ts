/** The default and the cap of every `limit` argument. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** The limit a query uses: the default when none is given, never above the cap, never below one. */
export function clampLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}
