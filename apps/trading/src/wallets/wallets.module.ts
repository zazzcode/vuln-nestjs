import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditWalletResolver } from './credit-wallet.resolver.js';
import { DepositResolver } from './deposit.resolver.js';
import { LedgerEntryEntity } from './ledger-entry.entity.js';
import { LedgerResolver } from './ledger.resolver.js';
import { WalletEntity } from './wallet.entity.js';
import { WalletOfResolver } from './wallet-of.resolver.js';
import { WalletResolver } from './wallet.resolver.js';
import { WalletsByUserResolver } from './wallets-by-user.resolver.js';
import { PayoutResolver } from './payout.resolver.js';
import { WithdrawResolver } from './withdraw.resolver.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, LedgerEntryEntity])],
  providers: [
    WalletsService,
    WalletResolver,
    LedgerResolver,
    WalletsByUserResolver,
    DepositResolver,
    CreditWalletResolver,
    WalletOfResolver,
    WithdrawResolver,
    PayoutResolver,
  ],
  exports: [WalletsService],
})
export class WalletsModule {}
