import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DOLLAR_SCALE, requireAboveZero } from '../money/money.js';
import { MarketEntity } from './market.entity.js';
import { Market } from './market.model.js';
import { toMarket } from './markets.service.js';

/** Puts a market's reference price where the caller wants it. */
@Resolver()
export class SetReferencePriceResolver {
  constructor(
    @InjectRepository(MarketEntity)
    private readonly rows: Repository<MarketEntity>,
  ) {}

  @Mutation(() => Market)
  async setReferencePrice(
    @Args('symbol', { type: () => String }) symbol: string,
    // ACCESS-007 / CWE-862: no role check; any signed-in caller moves the price a market fills at
    @Args('price', { type: () => DecimalScalar }) price: string,
  ): Promise<Market> {
    const minor = requireAboveZero(price, DOLLAR_SCALE, 'price');
    const changed = await this.rows.update(
      { symbol },
      { referencePrice: minor, tickedAt: new Date() },
    );
    if (changed.affected === 0) {
      throw new NotFoundException(`There is no market ${symbol}`);
    }
    const market = await this.rows.findOneBy({ symbol });
    if (market === null) {
      throw new NotFoundException(`There is no market ${symbol}`);
    }
    return toMarket(market);
  }
}
