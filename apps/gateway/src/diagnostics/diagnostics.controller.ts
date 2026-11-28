import { Controller, Get } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';

/** What a diagnostics page may say of the environment: the keys on this list, and nothing else. */
const ENVIRONMENT_KEYS: readonly string[] = [
  'NODE_ENV',
  'GATEWAY_PORT',
  'ACCOUNTS_PORT',
  'TRADING_PORT',
  'NOTIFICATIONS_PORT',
];

/**
 * The diagnostics page for an administrator: the versions this edge runs on,
 * and the environment keys it was explicitly given leave to show. A key that
 * is not on the list is not read, so its value cannot leave the process.
 */
@Controller('api/v1/admin')
export class DiagnosticsController {
  @Roles('ADMIN')
  @Get('diagnostics')
  diagnostics() {
    return {
      service: 'gateway',
      node: process.version,
      platform: process.platform,
      versions: { ...process.versions },
      environment: Object.fromEntries(
        ENVIRONMENT_KEYS.map((key) => [key, process.env[key] ?? null]),
      ),
    };
  }
}
