import { Query, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Wallet } from './wallet.model.js';
import { WalletsService } from './wallets.service.js';

/** The caller's own balances. There is no `userId` argument to give another user's. */
@Resolver()
export class WalletResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Query(() => [Wallet], { name: 'wallet' })
  own(@UserId() caller: string): Promise<Wallet[]> {
    return this.wallets.ofUser(caller);
  }
}
