import type { AlertDirection, AlertEntity } from './alert.entity.js';

/**
 * Two decimal strings compared by value: never as text, never through a
 * float. Returns below zero when `left` is the smaller, zero when they are
 * the same number, above zero when `left` is the greater.
 */
export function compareDecimals(left: string, right: string): number {
  const parse = (value: string) => {
    const negative = value.startsWith('-');
    const bare = negative ? value.slice(1) : value;
    const [whole = '0', fraction = ''] = bare.split('.');
    return { negative, whole: whole.replace(/^0+(?=\d)/, ''), fraction };
  };
  const a = parse(left);
  const b = parse(right);

  if (a.negative !== b.negative) {
    return a.negative ? -1 : 1;
  }
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const aDigits =
    a.whole.padStart(Math.max(a.whole.length, b.whole.length), '0') +
    a.fraction.padEnd(scale, '0');
  const bDigits =
    b.whole.padStart(Math.max(a.whole.length, b.whole.length), '0') +
    b.fraction.padEnd(scale, '0');
  const compared = aDigits < bDigits ? -1 : aDigits > bDigits ? 1 : 0;
  return a.negative ? -compared : compared;
}

/** Whether a price crossed an alert in the alert's direction. Equal is not crossed. */
export function crossed(
  direction: AlertDirection,
  threshold: string,
  price: string,
): boolean {
  const compared = compareDecimals(price, threshold);
  return direction === 'ABOVE' ? compared > 0 : compared < 0;
}

/** The rule an alert is evaluated with: a threshold and an operator, and nothing else. */
export class AlertRule {
  crossed(
    alert: Pick<AlertEntity, 'direction' | 'threshold'>,
    price: string,
  ): boolean {
    return crossed(alert.direction, alert.threshold, price);
  }
}
