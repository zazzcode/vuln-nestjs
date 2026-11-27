import {
  Directive,
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { DateTimeScalar } from '@zazzles/exchange-graphql';

/** How one delivery attempt ended. */
export enum DeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

registerEnumType(DeliveryStatus, { name: 'DeliveryStatus' });

/** A delivery of the graph, with the key the gateway resolves it by. What the receiver answered is not in the graph. */
@ObjectType()
@Directive('@key(fields: "id")')
export class Delivery {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { nullable: true })
  alertId: string | null;

  @Field()
  url: string;

  @Field(() => DeliveryStatus)
  status: DeliveryStatus;

  @Field()
  attempts: number;

  @Field(() => String, { nullable: true })
  lastError: string | null;

  @Field(() => DateTimeScalar)
  createdAt: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  deliveredAt: Date | null;
}

/** A delivery record as the graph answers it. */
export function toDelivery(row: {
  id: number;
  alertId: number | null;
  url: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}): Delivery {
  const status =
    row.status === 'DELIVERED'
      ? DeliveryStatus.DELIVERED
      : row.status === 'PENDING'
        ? DeliveryStatus.PENDING
        : DeliveryStatus.FAILED;
  return {
    id: String(row.id),
    alertId: row.alertId === null ? null : String(row.alertId),
    url: row.url,
    status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  };
}
