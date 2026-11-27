import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntryEntity } from './ledger-entry.entity.js';
import { WalletEntity } from './wallet.entity.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, LedgerEntryEntity])],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
