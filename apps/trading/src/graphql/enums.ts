import { registerEnumType } from '@nestjs/graphql';
import { Asset } from '../money/money.js';
import { OrderSide, OrderStatus, OrderType } from '../orders/order.entity.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { TradeOrderBy } from '../trades/trade-order-by.js';

/**
 * The enums of this subgraph, registered once. Imported by the GraphQL module,
 * so every schema generation sees them whatever resolver runs first.
 */
export function registerGraphEnums(): void {
  registerEnumType(Asset, {
    name: 'Asset',
    description: 'Every asset a wallet can hold: the dollar and five coins.',
  });
  registerEnumType(OrderSide, { name: 'Side', description: 'BUY or SELL.' });
  registerEnumType(OrderType, {
    name: 'OrderType',
    description: 'A market order or a limit order.',
  });
  registerEnumType(OrderStatus, {
    name: 'OrderStatus',
    description: 'An open order, a filled one, a cancelled one.',
  });
  registerEnumType(LedgerKind, {
    name: 'LedgerKind',
    description: 'What moved money.',
  });
  registerEnumType(TradeOrderBy, {
    name: 'TradeOrderBy',
    description: 'A trade list may be ordered by time or by price.',
  });
}
