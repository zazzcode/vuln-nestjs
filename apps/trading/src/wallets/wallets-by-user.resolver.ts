import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Roles, UserId } from '@zazzles/exchange-internal-auth';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** Any user's balances, by id. An administrator's operation. */
@Resolver()
export class WalletsByUserResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Roles('ADMIN')
  @Query(() => [Wallet], { name: 'wallets' })
  ofUser(
    @UserId() caller: string,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<Wallet[]> {
    void caller;
    return this.wallets.ofUser(userId);
  }
}
