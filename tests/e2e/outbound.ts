/** An outgoing connection a service's process opened. */
export interface Connection {
  host: string;
  port: number;
}

/** What one service's process reported about itself when it stopped. */
export interface OutboundReport {
  service: string;
  connections: Connection[];
  lookups: string[];
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The reports the services wrote as they stopped, by service, read from what
 * the launcher collected. Each service that was preloaded with
 * `outbound-hook.mjs` writes one line as it exits.
 *
 * A service that is missing from the result did not stop, or was not asked to
 * report. That is "not proven", never "nothing to report".
 */
export function outboundReports(printed: string): Map<string, OutboundReport> {
  const reports = new Map<string, OutboundReport>();
  for (const line of printed.split('\n')) {
    const match = /^(\w+) \| OUTBOUND-WATCH (.*)$/.exec(line);
    if (match?.[1] && match[2]) {
      const report = JSON.parse(match[2]) as Omit<OutboundReport, 'service'>;
      reports.set(match[1], {
        service: match[1],
        connections: report.connections,
        lookups: report.lookups,
      });
    }
  }
  return reports;
}

/** Among a service's connections and lookups, those that do not go to this machine. */
export function elsewhere(report: OutboundReport): {
  connections: Connection[];
  lookups: string[];
} {
  return {
    connections: report.connections.filter(({ host }) => !LOOPBACK.has(host)),
    lookups: report.lookups.filter((host) => !LOOPBACK.has(host)),
  };
}
