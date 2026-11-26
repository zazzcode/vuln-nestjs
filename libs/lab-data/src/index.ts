/**
 * The fake data every service's seed refers to. A wallet in `trading` belongs to
 * `u-alice`, and so does the user in `accounts`, without either asking the other.
 * All of it is invented; none of it is a real person's.
 */
export interface LabUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: 'ADMIN' | 'USER';
  /** Dollars at the start, in cents. `null` for the administrator, who has no wallet. */
  readonly startingUsdCents: number | null;
}

export interface LabMarket {
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: 'USD';
  /** A decimal string: the reference price of one base asset in the quote asset. */
  readonly referencePrice: string;
}

export const administrator: LabUser = {
  id: 'u-admin',
  email: 'admin@zazzles.exchange',
  displayName: 'Admin',
  password: 'admin-lab-only',
  role: 'ADMIN',
  startingUsdCents: null,
};

/** The starting balances differ on purpose: reading or changing another user's wallet then shows. */
export const labUsers: readonly LabUser[] = [
  administrator,
  {
    id: 'u-alice',
    email: 'alice@zazzles.exchange',
    displayName: 'Alice',
    password: 'alice-lab-only',
    role: 'USER',
    startingUsdCents: 1_000_000,
  },
  {
    id: 'u-bob',
    email: 'bob@zazzles.exchange',
    displayName: 'Bob',
    password: 'bob-lab-only',
    role: 'USER',
    startingUsdCents: 500_000,
  },
  {
    id: 'u-carol',
    email: 'carol@zazzles.exchange',
    displayName: 'Carol',
    password: 'carol-lab-only',
    role: 'USER',
    startingUsdCents: 250_000,
  },
  {
    id: 'u-dave',
    email: 'dave@zazzles.exchange',
    displayName: 'Dave',
    password: 'dave-lab-only',
    role: 'USER',
    startingUsdCents: 100_000,
  },
  {
    id: 'u-erin',
    email: 'erin@zazzles.exchange',
    displayName: 'Erin',
    password: 'erin-lab-only',
    role: 'USER',
    startingUsdCents: 50_000,
  },
];

/** The one moment every record of the fake data is stamped with, so that every run is identical. */
export const labStart = new Date('2026-01-01T00:00:00.000Z');

/** Five coins against the dollar, and where the price of each one starts. */
export const labMarkets: readonly LabMarket[] = [
  {
    symbol: 'BTC-USD',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    referencePrice: '65000.00',
  },
  {
    symbol: 'ETH-USD',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    referencePrice: '3200.00',
  },
  {
    symbol: 'SOL-USD',
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    referencePrice: '150.00',
  },
  {
    symbol: 'XRP-USD',
    baseAsset: 'XRP',
    quoteAsset: 'USD',
    referencePrice: '0.50',
  },
  {
    symbol: 'DOGE-USD',
    baseAsset: 'DOGE',
    quoteAsset: 'USD',
    referencePrice: '0.12',
  },
];
