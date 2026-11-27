import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { DatabaseModule } from './database/database.module.js';
import { Environment } from './config/environment.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { HealthModule } from './health/health.module.js';
import { MarketsModule } from './markets/markets.module.js';
import { MoneyModule } from './money/money.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SeedModule } from './seed/seed.module.js';
import { TradesModule } from './trades/trades.module.js';
import { WalletsModule } from './wallets/wallets.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    DatabaseModule,
    MarketsModule,
    WalletsModule,
    OrdersModule,
    TradesModule,
    ReportsModule,
    MoneyModule,
    SeedModule,
    HealthModule,
    GraphqlModule,
  ],
})
export class AppModule {}
