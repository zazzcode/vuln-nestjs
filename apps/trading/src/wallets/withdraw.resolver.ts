import { BadRequestException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { DOLLAR_SCALE, toMinorUnits } from '../money/money.js';
import { LedgerKind } from './ledger-entry.entity.js';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** The caller withdraws from their own dollar wallet. */
@Resolver()
export class WithdrawResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Mutation(() => [Wallet])
  async withdraw(
    @UserId() caller: string,
    @Args('amount', { type: () => DecimalScalar }) amount: string,
  ): Promise<Wallet[]> {
    // The amount is checked before any balance changes: @Min(0.01), the smallest withdrawal is one cent.
    const minor = toMinorUnits(amount, DOLLAR_SCALE);
    if (minor === null || minor.startsWith('-') || BigInt(minor) < 1n) {
      throw new BadRequestException(
        'The smallest withdrawal is 0.01 (@Min(0.01) on the amount)',
      );
    }
    // One conditional update: the balance cannot go below zero, and a race has no window.
    await this.wallets.adjust(
      caller,
      'USD',
      `-${minor}`,
      LedgerKind.WITHDRAWAL,
      'withdrawal',
    );
    return this.wallets.ofUser(caller);
  }
}
