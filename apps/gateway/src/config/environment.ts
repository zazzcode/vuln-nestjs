import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Integer } from '@zazzles/exchange-config';

/** The variables this service reads. Checked at start: one that is missing or malformed stops it before it listens. */
export class Environment {
  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  GATEWAY_PORT = 3000;

  /** The three backend services, on the ports this gateway reaches them on. */
  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  ACCOUNTS_PORT = 3101;

  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  TRADING_PORT = 3102;

  @Integer()
  @IsInt()
  @Min(1)
  @Max(65535)
  NOTIFICATIONS_PORT = 3103;

  /** The secret every service signs and verifies session tokens with. Generated for each run. */
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  /** What this gateway presents on a call it makes on the system's behalf. Generated for each run. */
  @IsString()
  @MinLength(32)
  INTERNAL_SERVICE_TOKEN!: string;

  /** The origins the partner ticker answers CORS for, comma-separated. An origin not in the list is not echoed. */
  @IsOptional()
  @IsString()
  PARTNER_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000';

  /** The origins a redirect may carry the caller to, comma-separated. A `next` elsewhere is not followed. */
  @IsOptional()
  @IsString()
  REDIRECT_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000';

  /** The origins both lists read: split once, trimmed, empty entries dropped. */
  static originsOf(value: string): readonly string[] {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
  }
}
