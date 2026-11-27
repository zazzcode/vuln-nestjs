import { administrator, labMarkets, labUsers } from './index.js';

describe('the fake data', () => {
  it('holds an administrator and five users, with distinct identifiers and distinct emails', () => {
    expect(labUsers).toHaveLength(6);
    expect(new Set(labUsers.map((user) => user.id)).size).toBe(6);
    expect(new Set(labUsers.map((user) => user.email)).size).toBe(6);
    expect(labUsers.filter((user) => user.role === 'ADMIN')).toEqual([
      administrator,
    ]);
    expect(labUsers.filter((user) => user.role === 'USER')).toHaveLength(5);
  });

  // Every seed writes these identifiers: a store with an auto-increment key would not return them.
  it('gives every record a fixed identifier that names no real person', () => {
    for (const user of labUsers) {
      expect(user.id).toMatch(/^u-[a-z]+$/);
      expect(user.email).toMatch(/^[a-z]+@vcx\.exchange$/);
    }
  });

  it('gives every user a starting balance in whole cents, and the administrator none', () => {
    for (const user of labUsers) {
      if (user === administrator) {
        expect(user.startingUsdCents).toBeNull();
      } else {
        expect(Number.isInteger(user.startingUsdCents)).toBe(true);
      }
    }
  });

  it('has five markets against the dollar, each starting at a decimal string', () => {
    expect(labMarkets.map((market) => market.symbol)).toEqual([
      'BTC-USD',
      'ETH-USD',
      'SOL-USD',
      'XRP-USD',
      'DOGE-USD',
    ]);
    for (const market of labMarkets) {
      expect(market.quoteAsset).toBe('USD');
      expect(market.referencePrice).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
