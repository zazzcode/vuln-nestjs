import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { clampLimit } from '@zazzles/exchange-graphql';
import { Asset } from '../money/money.js';
import { LedgerEntry } from './ledger-entry.model.js';
import { WalletsService } from './wallets.service.js';

/** The caller's own ledger. There is no `userId` argument to give another user's. */
@Resolver()
export class LedgerResolver {
  constructor(private readonly wallets: WalletsService) {}

  @Query(() => [LedgerEntry], { name: 'ledger' })
  async own(
    @UserId() caller: string,
    @Args('asset', { type: () => Asset, nullable: true }) asset?: Asset,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<LedgerEntry[]> {
    return this.wallets.ledgerOf(caller, asset, clampLimit(limit), offset ?? 0);
  }
}
