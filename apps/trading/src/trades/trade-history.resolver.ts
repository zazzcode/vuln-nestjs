import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Args, InputType, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { OrderSide } from '../orders/order.entity.js';
import { Field } from '@nestjs/graphql';
import { Repository } from 'typeorm';
import { TradeEntity } from './trade.entity.js';
import { Trade } from './trade.model.js';
import { toTrade } from './trades.service.js';

/** What a caller may ask of a trade history. */
@InputType()
export class TradeHistoryInput {
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  symbol?: string;

  @IsOptional()
  @IsEnum(OrderSide)
  @Field(() => OrderSide, { nullable: true })
  side?: OrderSide;

  @IsOptional()
  @IsString()
  @Field(() => DecimalScalar, { nullable: true })
  minPrice?: string;
}

/** The trades a caller asks for, with the history input as it arrived. */
@Resolver()
export class TradeHistoryResolver {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}

  @Query(() => [Trade])
  async tradeHistory(
    @Args('input', { type: () => TradeHistoryInput })
    input: TradeHistoryInput,
  ): Promise<Trade[]> {
    // SQL-002 / CWE-89: a raw fragment of the query builder is still SQL text; the values were concatenated into it
    const where = `t.symbol = '${input.symbol ?? ''}' AND t.side = '${input.side ?? ''}'`;
    const found = await this.rows
      .createQueryBuilder('t')
      .where(where)
      .getMany();
    return found.map(toTrade);
  }
}
