import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { Integer } from '@zazzles/exchange-config';

/** The variables this service reads. Checked at start: one that is missing or malformed stops it before it listens. */
export class Environment {
  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  NOTIFICATIONS_PORT = 3103;

  /** The secret every service signs and verifies session tokens with. Generated for each run. */
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  /** What the gateway presents on a call it makes on the system's behalf. Generated for each run. */
  @IsString()
  @MinLength(32)
  INTERNAL_SERVICE_TOKEN!: string;

  /** The origins a webhook may be sent to, comma-separated. The loopback test receiver by default. */
  @IsString()
  WEBHOOK_ALLOWED_ORIGINS = 'http://127.0.0.1:4010';

  /** The allowlist, as the outbound guard compares it: trimmed, without empty entries. */
  get webhookOrigins(): string[] {
    return this.WEBHOOK_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
  }
}
