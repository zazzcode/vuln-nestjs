import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { In, Repository } from 'typeorm';
import { Asset } from '../money/money.js';
import { MarketEntity } from './market.entity.js';
import { Market } from './market.model.js';
import { toMarket } from './markets.service.js';

/** The markets whose base asset is one of a list the schema itself checked. */
@Resolver()
export class MarketsByAssetsResolver {
  constructor(
    @InjectRepository(MarketEntity)
    private readonly rows: Repository<MarketEntity>,
  ) {}

  /** An enum list, bound with `In`: a value that is not an `Asset` never reaches this code. */
  @Public()
  @Query(() => [Market])
  async marketsByAssets(
    @Args('assets', { type: () => [Asset] }) assets: Asset[],
  ): Promise<Market[]> {
    const rows = await this.rows.find({
      where: { baseAsset: In(assets) },
      order: { symbol: 'ASC' },
    });
    return rows.map(toMarket);
  }
}
