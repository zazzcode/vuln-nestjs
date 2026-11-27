import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** Any user's balances, by id. */
@Resolver()
export class WalletOfResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Query(() => [Wallet])
  walletOf(
    // ACCESS-008 / CWE-639: the caller names any user, and the balances answer to the token alone
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<Wallet[]> {
    return this.wallets.ofUser(userId);
  }
}
