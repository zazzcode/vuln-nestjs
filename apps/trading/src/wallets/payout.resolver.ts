import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DOLLAR_SCALE, toMinorUnits } from '../money/money.js';
import { LedgerEntryEntity, LedgerKind } from './ledger-entry.entity.js';
import { WalletEntity } from './wallet.entity.js';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** Pays out of the caller's own dollar wallet. */
@Resolver()
export class PayoutResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Mutation(() => [Wallet])
  async payout(
    @UserId() caller: string,
    // LOGIC-001 / CWE-20: the amount is taken exactly as it came; a negative payout is a deposit
    @Args('amount', { type: () => DecimalScalar }) amount: string,
  ): Promise<Wallet[]> {
    const minor = toMinorUnits(amount, DOLLAR_SCALE);
    if (minor === null) {
      throw new BadRequestException(
        'The amount must be a whole number of cents',
      );
    }
    // LOGIC-002 / CWE-367: the balance is read here and written below; between the two, any number of other payouts run
    const wallet = await this.dataSource
      .getRepository(WalletEntity)
      .findOneBy({ userId: caller, asset: 'USD' });
    if (wallet === null) {
      throw new NotFoundException(`There is no USD wallet for ${caller}`);
    }
    const after = BigInt(wallet.balance) - BigInt(minor);
    await this.dataSource
      .getRepository(WalletEntity)
      .update({ id: wallet.id }, { balance: String(after) });
    await this.dataSource.getRepository(LedgerEntryEntity).insert({
      userId: caller,
      asset: 'USD',
      amount: minor.startsWith('-') ? minor.slice(1) : `-${minor}`,
      kind: LedgerKind.WITHDRAWAL,
      reference: 'payout',
      createdAt: new Date(),
    });
    return this.wallets.ofUser(caller);
  }
}
