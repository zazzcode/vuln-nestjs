/**
 * The part of Newman's Node API that the API runner uses. The package ships
 * no types of its own, and one more dependency for its types would be one
 * more entry in the audit.
 */
declare module 'newman' {
  interface NewmanExecution {
    request?: { method?: string; url?: unknown };
    /** Set when the request itself did not go through: nothing listened, or nothing answered. */
    requestError?: unknown;
  }

  interface NewmanFailure {
    source?: { name?: string; id?: string };
    error?: { message?: string; test?: string };
  }

  const newman: {
    run(
      options: object,
      done: (
        error: Error | null,
        summary: {
          run: { executions: NewmanExecution[]; failures: NewmanFailure[] };
        },
      ) => void,
    ): unknown;
  };

  export default newman;
}
