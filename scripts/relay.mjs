// An HTTP/1.1 relay in front of a listener that speaks HTTP/2 cleartext.
//
// curl, Postman, Newman and Burp negotiate HTTP/2 only over TLS, and the lab has
// no TLS, so none of them reaches a service that speaks HTTP/2. A relay listens
// on loopback, carries each request to the service over HTTP/2 with prior
// knowledge, and streams the answer back. It decides nothing: the method, the
// path, the headers and the body are the caller's, and the status, the headers
// and the body are the service's. What belongs to one connection, the hop-by-hop
// headers, does not cross. The service sees its own address as the authority,
// which is what it sees when the gateway calls.
//
// The launcher opens one for each service on HTTP/2 and closes it before
// anything else stops: a relay is a caller of the services, like the gateway.
import { createServer } from 'node:http';
import { connect } from 'node:http2';
import { connect as connectSocket } from 'node:net';

/** Headers that belong to one connection and are not carried to the next. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
]);

/** The headers that `connection` names, which belong to the connection too. */
const namedByConnection = (headers) =>
  new Set(
    String(headers.connection ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ''),
  );

/** The headers of one side, without those of HTTP/2 itself, the hop-by-hop ones, and any others named. */
const carried = (headers, except = new Set()) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !name.startsWith(':') && !HOP_BY_HOP.has(name) && !except.has(name),
    ),
  );

/**
 * @typedef {object} Relay
 * @property {string} service The service the relay leads to.
 * @property {number} port Where the relay listens, on 127.0.0.1.
 * @property {string} url `http://127.0.0.1:<port>`.
 * @property {string} target The service's own address, where it speaks HTTP/2.
 * @property {() => number} openSessions The connections to the service that a request has not finished with.
 * @property {() => Promise<void>} close Stops listening, ends what is in flight, and resolves once nothing is left.
 */

/**
 * Opens a relay.
 *
 * Every request gets a connection of its own to the service, closed once the
 * answer has been read to its end. A connection closed over an unread answer
 * stays open on both sides, and the service then waits on it when it is stopped.
 * A caller that goes away before the answer is over has its request closed.
 *
 * @param {{ service: string, port: number, target: string }} options
 * @returns {Promise<Relay>} Rejects when nothing can listen on the port.
 */
export function openRelay({ service, port, target }) {
  const url = new URL(target);
  const sessions = new Set();

  const server = createServer((request, response) => {
    const session = connect(url.origin);
    sessions.add(session);
    session.once('close', () => sessions.delete(session));

    // The caller addressed the relay. The service is asked for its own address, which is what it is asked for when the gateway calls.
    const headers = { ...request.headers };
    delete headers.host;
    const stream = session.request({
      ':method': request.method,
      ':path': request.url,
      ':scheme': 'http',
      ':authority': url.host,
      ...carried(headers, namedByConnection(headers)),
    });
    let failed = false;
    // The service did not answer. A caller that has an answer already has its connection ended.
    const fail = () => {
      if (failed || response.destroyed) {
        return;
      }
      failed = true;
      session.destroy();
      request.resume();
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          statusCode: 502,
          error: 'Bad Gateway',
          message: `${service} did not answer`,
        }),
      );
    };
    stream.on('error', fail);
    session.on('error', fail);
    response.on('error', () => undefined);
    stream.on('response', (head) => {
      response.writeHead(
        Number(head[':status']),
        carried(head, namedByConnection(head)),
      );
      // Read to the end, which is also what ends the response.
      stream.pipe(response);
    });
    stream.on('close', () => session.close());
    // The caller went away with the answer not over: the service is told, and nothing is kept for it.
    response.on('close', () => {
      if (!response.writableEnded) {
        stream.close();
      }
    });
    // Ending the request ends the stream, so a request without a body is sent.
    request.pipe(stream);
  });

  return new Promise((resolve, reject) => {
    const refused = (error) =>
      reject(
        new Error(
          `The relay to ${service} could not listen on 127.0.0.1:${port}: ${error.message}`,
        ),
      );
    server.once('error', refused);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', refused);
      resolve({
        service,
        port: server.address().port,
        url: `http://127.0.0.1:${server.address().port}`,
        target,
        openSessions: () => sessions.size,
        // Asked for a second time, it finds nothing left to close and changes nothing.
        close: async () => {
          // Every connection to the service is ended, and known to be ended, before the relay is said to be closed.
          const ended = [...sessions].map(
            (session) =>
              new Promise((resolve) => {
                session.once('close', resolve);
                session.destroy();
              }),
          );
          const listening = new Promise((resolve) => {
            server.close(() => resolve());
            // A caller may hold a connection open for its next request. The relay is closing: it does not wait for it.
            server.closeAllConnections();
          });
          await Promise.all([listening, ...ended]);
        },
      });
    });
  });
}

/**
 * True when something accepts a connection on a port. For a test that proves a
 * listener is where it should be, and is gone once the lab has stopped.
 *
 * @param {number} port
 * @param {string} [host]
 */
export function answersOn(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = connectSocket({ port, host });
    socket.setTimeout(2_000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
