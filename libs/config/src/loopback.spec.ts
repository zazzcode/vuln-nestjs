import { LOOPBACK_HOST, assertLoopbackListener } from './loopback.js';

const listening = (address: string) => ({
  address,
  family: 'IPv4',
  port: 3101,
});

describe('assertLoopbackListener', () => {
  it('accepts a listener bound to the loopback address', () => {
    expect(() =>
      assertLoopbackListener(listening(LOOPBACK_HOST)),
    ).not.toThrow();
    expect(() => assertLoopbackListener(LOOPBACK_HOST)).not.toThrow();
  });

  // Every interface, IPv6 every interface, and an address of the machine's own network.
  it.each(['0.0.0.0', '::', '192.168.1.20'])(
    'refuses a listener bound to %s',
    (address) => {
      expect(() => assertLoopbackListener(listening(address))).toThrow(
        LOOPBACK_HOST,
      );
    },
  );

  it('refuses a listener that is not listening', () => {
    expect(() => assertLoopbackListener(null)).toThrow();
  });
});
