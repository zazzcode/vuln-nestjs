import { Decimal } from 'decimal.js';

/** A dollar, in cents. */
export const DOLLAR_SCALE = 2;
/** A coin, in hundred-millionths. */
export const COIN_SCALE = 8;

/** Minor units as the graph carries them: a decimal string with every digit of the asset's scale. */
export function toDecimal(minorUnits: string, scale: number): string {
  return new Decimal(minorUnits).div(new Decimal(10).pow(scale)).toFixed(scale);
}
