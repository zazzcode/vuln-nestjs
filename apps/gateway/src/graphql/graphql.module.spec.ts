import { describe, expect, it } from 'vitest';
import '@zazzles/exchange-config';
import './graphql.module.js';

// The gateway package exports facts about the machine every hour unless it is told not to (measured on
// 2026-11-26: by default it resolves usage-reporting.api.apollographql.com and metadata.google.internal
// at start). The lab sends no telemetry, so the switch is set before anything constructs a gateway.
describe('the gateway package telemetry', () => {
  it('is switched off by the module that constructs the gateway', () => {
    expect(process.env.APOLLO_TELEMETRY_DISABLED).toBe('true');
  });
});
