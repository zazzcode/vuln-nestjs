import type { AlertEntity } from './alert.entity.js';

/**
 * Runs a smart alert's stored expression, with the alert and the price in
 * scope, and takes its value as whether the alert crossed.
 */
export function evaluateExpression(
  alert: AlertEntity,
  price: string,
  threshold: string | null,
): unknown {
  return eval(alert.expression ?? 'false'); // DESER-002 / CWE-95: the stored expression is run as code, with the alert's row in scope
}
