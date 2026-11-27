// Records every outgoing connection and every name resolution of the process
// that loads this. Everything that reaches the network, HTTP or not, goes
// through `net.Socket#connect` or through the resolver, so this sees the
// telemetry a dependency might send and the metadata endpoint one might read.
//
// Plain Node, with no dependency: it is loaded into a service's own process,
// before anything of the lab, and must not need a build.

import { createRequire } from 'node:module';

// The builtin modules as objects that can be written to. A namespace import cannot be.
const require = createRequire(import.meta.url);

/** @typedef {{ host: string, port: number }} Connection An outgoing connection the process opened. */

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/** Where a call to `Socket.connect` goes. Its arguments are (options), (path) or (port, host). */
function destination(args) {
  // `net.connect` and `http2.connect` hand the arguments over already normalised, as [options, listener].
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const second = args[1];
  if (typeof first === 'object' && first !== null) {
    const options = first;
    // A pipe between processes is not a connection to anywhere.
    if (options.path !== undefined) {
      return undefined;
    }
    return {
      host: String(options.host ?? 'localhost'),
      port: options.port ?? 0,
    };
  }
  if (typeof first === 'string') {
    return undefined;
  }
  return {
    host: typeof second === 'string' ? second : 'localhost',
    port: Number(first),
  };
}

export function watchOutbound() {
  const connections = [];
  const lookups = [];

  // The builtin modules are shared, so the functions are replaced on their objects, which are mutable.
  const net = require('node:net');
  const dns = require('node:dns');
  // Both are kept to be called with their receiver, once the watch is over.
  // oxlint-disable-next-line typescript/unbound-method
  const originalConnect = net.Socket.prototype.connect;
  // oxlint-disable-next-line typescript/unbound-method
  const originalLookup = dns.lookup;

  net.Socket.prototype.connect = function patchedConnect(...args) {
    const target = destination(args);
    if (target) {
      connections.push(target);
    }
    return originalConnect.apply(this, args);
  };
  dns.lookup = function patchedLookup(...args) {
    lookups.push(String(args[0]));
    return originalLookup.apply(this, args);
  };

  const elsewhere = () => ({
    connections: connections.filter(({ host }) => !LOOPBACK.has(host)),
    lookups: lookups.filter((host) => !LOOPBACK.has(host)),
  });

  return { connections, lookups, elsewhere };
}
