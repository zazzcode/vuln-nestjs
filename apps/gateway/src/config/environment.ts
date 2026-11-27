import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';
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
}
