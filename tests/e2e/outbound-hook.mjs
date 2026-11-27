// Loaded into each service's process by the end-to-end suite, before the
// service itself: `node --import tests/e2e/outbound-hook.mjs apps/<name>/dist/main.js`.
//
// The suite cannot see what another process connects to. So each service
// watches its own outgoing connections from its first moment, and when it
// exits it writes what it saw to standard error, on a line the launcher
// passes on and the suite reads:
//
//     OUTBOUND-WATCH {"connections":[…],"lookups":[…]}
//
// A service that is killed instead of stopped never writes the line, which
// the suite treats as "not proven" rather than as "nothing to report".
import { writeSync } from 'node:fs';
import { watchOutbound } from './outbound-watch.mjs';

const watch = watchOutbound();

process.on('exit', () => {
  let report;
  try {
    report = JSON.stringify({
      connections: watch.connections,
      lookups: watch.lookups,
    });
  } catch {
    report = '{"error":"the watch could not be serialised"}';
  }
  // Synchronous, because nothing asynchronous runs during exit.
  writeSync(2, `OUTBOUND-WATCH ${report}\n`);
});
