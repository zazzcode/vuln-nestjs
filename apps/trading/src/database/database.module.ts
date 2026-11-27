import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketEntity } from '../markets/market.entity.js';
import { PriceTickEntity } from '../markets/price-tick.entity.js';
import { OrderEntity } from '../orders/order.entity.js';
import { ReportEntity } from '../reports/report.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';
import { LedgerEntryEntity } from '../wallets/ledger-entry.entity.js';
import { WalletEntity } from '../wallets/wallet.entity.js';
import { MysqlStore } from './mysql.store.js';
import { SqlClient } from './sql-client.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [MysqlStore],
      // The factory waits for the engine, so nothing reaches the store before it is up.
      useFactory: async (store: MysqlStore) => ({
        type: 'mysql' as const,
        ...(await store.open()),
        entities: [
          MarketEntity,
          PriceTickEntity,
          WalletEntity,
          LedgerEntryEntity,
          OrderEntity,
          TradeEntity,
          ReportEntity,
        ],
        // Every store is ephemeral, so the entities are the schema. There are no migrations.
        synchronize: true,
        // Queries contain user data.
        logging: false,
      }),
    }),
  ],
  providers: [MysqlStore, SqlClient],
  exports: [MysqlStore, SqlClient, TypeOrmModule],
})
export class DatabaseModule {}
