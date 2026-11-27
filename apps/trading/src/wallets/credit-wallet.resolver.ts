import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { DOLLAR_SCALE, requireAboveZero } from '../money/money.js';
import { LedgerKind } from './ledger-entry.entity.js';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** Credits a wallet, as a convenience for support and testing. */
@Resolver()
export class CreditWalletResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Mutation(() => [Wallet])
  async creditWallet(
    // ACCESS-009 / CWE-862: the amount is checked, the role is not; a signed-in caller is enough
    @Args('userId', { type: () => ID }) userId: string,
    @Args('amount', { type: () => DecimalScalar }) amount: string,
  ): Promise<Wallet[]> {
    const minor = requireAboveZero(amount, DOLLAR_SCALE);
    await this.wallets.adjust(
      userId,
      'USD',
      minor,
      LedgerKind.DEPOSIT,
      'credit',
    );
    return this.wallets.ofUser(userId);
  }
}
