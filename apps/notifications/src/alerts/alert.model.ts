import {
  Directive,
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';

/** The two ways an alert can point. */
export enum AlertDirection {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

registerEnumType(AlertDirection, { name: 'AlertDirection' });

/** An alert of the graph, with the key the gateway resolves it by. */
@ObjectType()
@Directive('@key(fields: "id")')
export class Alert {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field()
  symbol: string;

  @Field(() => AlertDirection)
  direction: AlertDirection;

  /** A decimal string, such as `"70000.00"`. */
  @Field(() => DecimalScalar)
  threshold: string;

  @Field(() => String, { nullable: true })
  label: string | null;

  @Field()
  enabled: boolean;

  @Field(() => DateTimeScalar, { nullable: true })
  lastTriggeredAt: Date | null;

  @Field(() => DateTimeScalar)
  createdAt: Date;
}

/** An alert as the graph creates it: a market, a direction and a threshold. */
export function toAlert(row: {
  id: number;
  userId: string;
  symbol: string;
  direction: string;
  threshold: string;
  label: string | null;
  enabled: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}): Alert {
  return {
    id: String(row.id),
    userId: row.userId,
    symbol: row.symbol,
    direction:
      row.direction === 'ABOVE' ? AlertDirection.ABOVE : AlertDirection.BELOW,
    threshold: row.threshold,
    label: row.label,
    enabled: row.enabled,
    lastTriggeredAt: row.lastTriggeredAt,
    createdAt: row.createdAt,
  };
}
