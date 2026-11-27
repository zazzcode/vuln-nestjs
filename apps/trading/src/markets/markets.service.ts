import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketEntity } from './market.entity.js';
import { type Market } from './market.model.js';
import { DOLLAR_SCALE, toDecimal } from '../money/money.js';

/** The markets and their reference prices. */
@Injectable()
export class MarketsService {
  constructor(
    @InjectRepository(MarketEntity)
    private readonly rows: Repository<MarketEntity>,
  ) {}

  async bySymbol(symbol: string): Promise<Market | null> {
    const row = await this.rows.findOneBy({ symbol });
    return row === null ? null : toMarket(row);
  }
}

export function toMarket(row: MarketEntity): Market {
  return {
    symbol: row.symbol,
    baseAsset: row.baseAsset as Market['baseAsset'],
    quoteAsset: row.quoteAsset as Market['quoteAsset'],
    referencePrice: toDecimal(row.referencePrice, DOLLAR_SCALE),
    tickedAt: row.tickedAt,
  };
}
