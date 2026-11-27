// oxlint-disable
// This file is the DESER-002 flaw: the expression runs as code, on purpose,
// and its variables are in scope precisely so the code can read them.
import type { AlertEntity } from './alert.entity.js';

/**
 * Runs a smart alert's stored expression, with the alert and the price in
 * scope, and takes its value as whether the alert crossed. The parameters
 * are the expression's variables, so they are deliberately unread here.
 */
export function evaluateExpression(
  alert: AlertEntity,
  price: string,
  threshold: string | null,
): unknown {
  return eval(alert.expression ?? 'false'); // DESER-002 / CWE-95: the stored expression is run as code, with the alert's row in scope
}
