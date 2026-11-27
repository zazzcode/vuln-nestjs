import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { DOLLAR_SCALE, requireAboveZero } from '../money/money.js';
import { LedgerKind } from './ledger-entry.entity.js';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** Credits a wallet. An administrator's operation, with the amount above zero. */
@Resolver()
export class DepositResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Roles('ADMIN')
  @Mutation(() => [Wallet])
  async deposit(
    @Args('userId', { type: () => ID }) userId: string,
    @Args('amount', { type: () => DecimalScalar }) amount: string,
  ): Promise<Wallet[]> {
    const minor = requireAboveZero(amount, DOLLAR_SCALE);
    await this.wallets.adjust(
      userId,
      'USD',
      minor,
      LedgerKind.DEPOSIT,
      'deposit',
    );
    return this.wallets.ofUser(userId);
  }
}
