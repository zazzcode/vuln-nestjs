import { Decimal } from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** A dollar, in cents. */
export const DOLLAR_SCALE = 2;
/** A coin, in hundred-millionths. */
export const COIN_SCALE = 8;

/** Every asset a wallet can hold: the dollar, and the base asset of each market. */
export enum Asset {
  USD = 'USD',
  BTC = 'BTC',
  ETH = 'ETH',
  SOL = 'SOL',
  XRP = 'XRP',
  DOGE = 'DOGE',
}

/** Every asset, in the order the fake data and the wallet answers use. */
export const everyAsset: readonly Asset[] = Object.values(Asset);

/** The scale of an asset: a dollar in cents, a coin in hundred-millionths. */
export function scaleOf(asset: string): number {
  return asset === Asset.USD ? DOLLAR_SCALE : COIN_SCALE;
}

/** Minor units as the graph carries them: a decimal string with every digit of the asset's scale. */
export function toDecimal(minorUnits: string | number, scale: number): string {
  return new Decimal(minorUnits).div(new Decimal(10).pow(scale)).toFixed(scale);
}

/** An amount as the graph carries it, in minor units. `null` when it is not a whole number of them. */
export function toMinorUnits(amount: string, scale: number): string | null {
  const minor = new Decimal(amount).times(new Decimal(10).pow(scale));
  return minor.isInteger() ? minor.toFixed(0) : null;
}

/** Whether a value is money as it is stored: a whole number of minor units. Only such a value reaches a balance. */
export function isMinorUnits(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d{1,38}$/.test(value);
}

/**
 * What a quantity costs at a price. Both in minor units; the result in the
 * minor units of the asset the price is in, rounded as the caller names.
 */
export function costOf(
  quantity: string,
  price: string,
  quantityScale: number,
  rounding: Decimal.Rounding,
): string {
  return new Decimal(quantity)
    .times(price)
    .div(new Decimal(10).pow(quantityScale))
    .toFixed(0, rounding);
}
