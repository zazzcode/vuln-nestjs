import { Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';
import { Asset } from '../money/money.js';
import { LedgerKind } from './ledger-entry.entity.js';

/** One movement of money, signed. */
@ObjectType()
export class LedgerEntry {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field(() => Asset)
  asset: Asset;

  @Field(() => DecimalScalar)
  amount: string;

  @Field(() => LedgerKind)
  kind: LedgerKind;

  @Field(() => String, { nullable: true })
  reference: string | null;

  @Field(() => DateTimeScalar)
  createdAt: Date;
}
