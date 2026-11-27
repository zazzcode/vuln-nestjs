// One collection, run under Newman, reduced to what a test asserts on.
import newman from 'newman';
import type { Variable } from './collections.js';

/** Newman's account of a run: what it sent, whether each request went through, and what did not hold. */
export interface NewmanRun {
  requests: { method: string; refused: string | null }[];
  /** One line per assertion that failed, naming its request. */
  failures: string[];
}

/** The message of an error Newman reports, whatever shape it came in. */
const messageOf = (error: unknown): string => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string'
    ? message
    : 'the request did not go through';
};

/**
 * Runs a collection with the given variables, to the end: a failed assertion
 * does not stop the ones after it, so that one run says everything that is wrong.
 */
export function runUnderNewman(
  collection: string,
  variables: Variable[],
): Promise<NewmanRun> {
  return new Promise((resolve, reject) => {
    newman.run(
      {
        collection,
        environment: { name: 'one run of the lab', values: variables },
        bail: false,
        reporters: [],
      },
      (error, summary) => {
        if (error) {
          reject(error);
          return;
        }
        const { executions, failures } = summary.run;
        resolve({
          requests: executions.map((execution) => ({
            method: execution.request?.method ?? '',
            refused:
              execution.requestError === undefined
                ? null
                : messageOf(execution.requestError),
          })),
          failures: failures.map((failure) =>
            [
              failure.source?.name ?? failure.source?.id ?? 'a request',
              [failure.error?.test, failure.error?.message]
                .filter(Boolean)
                .join(': '),
            ].join(' — '),
          ),
        });
      },
    );
  });
}
