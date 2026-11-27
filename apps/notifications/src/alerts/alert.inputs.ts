import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { AlertDirection } from './alert.model.js';

/** A structured alert: a market, a direction and a threshold. */
@InputType()
export class CreateAlertInput {
  @IsString()
  @Length(1, 16)
  @Field()
  symbol: string;

  @IsIn(['ABOVE', 'BELOW'])
  @Field(() => AlertDirection)
  direction: AlertDirection;

  @IsString()
  @Field(() => DecimalScalar)
  threshold: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Field(() => String, { nullable: true })
  label?: string;
}

/** A rule: the same comparison, from an input with no free-text field. */
@InputType()
export class RuleInput {
  @IsString()
  @Length(1, 16)
  @Field()
  symbol: string;

  @IsIn(['ABOVE', 'BELOW'])
  @Field(() => AlertDirection)
  direction: AlertDirection;

  @IsString()
  @Field(() => DecimalScalar)
  threshold: string;
}

/** One price of one market, as the evaluation receives it. */
@InputType()
export class PriceInput {
  @IsString()
  @Length(1, 16)
  @Field()
  symbol: string;

  @IsString()
  @Field(() => DecimalScalar)
  price: string;
}
