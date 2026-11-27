import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { COIN_SCALE, DOLLAR_SCALE, toDecimal } from '../money/money.js';
import { TradeEntity } from './trade.entity.js';
import { type Trade } from './trade.model.js';

export function toTrade(row: TradeEntity): Trade {
  return {
    id: String(row.id),
    orderId: String(row.orderId),
    symbol: row.symbol,
    side: row.side,
    price: toDecimal(row.price, DOLLAR_SCALE),
    quantity: toDecimal(row.quantity, COIN_SCALE),
    fee: toDecimal(row.fee, DOLLAR_SCALE),
    executedAt: row.executedAt,
  };
}

/** The trades: orders as they filled. */
@Injectable()
export class TradesService {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}
}
