import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { scaleOf, toDecimal } from '../money/money.js';
import { LedgerEntryEntity, LedgerKind } from './ledger-entry.entity.js';
import { type LedgerEntry } from './ledger-entry.model.js';
import { WalletEntity } from './wallet.entity.js';
import { type Wallet } from './wallet.model.js';

export function toWallet(row: WalletEntity): Wallet {
  return {
    id: String(row.id),
    userId: row.userId,
    asset: row.asset as Wallet['asset'],
    balance: toDecimal(row.balance, scaleOf(row.asset)),
  };
}

export function toLedgerEntry(row: LedgerEntryEntity): LedgerEntry {
  return {
    id: String(row.id),
    userId: row.userId,
    asset: row.asset as LedgerEntry['asset'],
    amount: toDecimal(row.amount, scaleOf(row.asset)),
    kind: row.kind,
    reference: row.reference,
    createdAt: row.createdAt,
  };
}

/** The wallets and the ledger. Every change of a balance goes through here. */
@Injectable()
export class WalletsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** A user's wallets. Whoever calls it has already settled whether the caller may see this user's wallets. */
  async ofUser(userId: string): Promise<Wallet[]> {
    const rows = await this.dataSource.getRepository(WalletEntity).find({
      where: { userId },
      order: { asset: 'ASC' },
    });
    return rows.map(toWallet);
  }

  /** A user's ledger, whole or for one asset. */
  async ledgerOf(
    userId: string,
    asset?: string,
    limit = 50,
    offset = 0,
  ): Promise<LedgerEntry[]> {
    const rows = await this.dataSource.getRepository(LedgerEntryEntity).find({
      where: asset === undefined ? { userId } : { userId, asset },
      order: { id: 'DESC' },
      take: limit,
      skip: offset,
    });
    return rows.map(toLedgerEntry);
  }

  /** One wallet, or nothing. */
  async wallet(userId: string, asset: string): Promise<Wallet | null> {
    const row = await this.dataSource.getRepository(WalletEntity).findOneBy({
      userId,
      asset,
    });
    return row === null ? null : toWallet(row);
  }

  /**
   * One change of a balance: a single conditional `UPDATE`, so the balance can
   * never go below zero and a race has no window, with the ledger entry written
   * beside it in the same transaction.
   */
  async adjust(
    userId: string,
    asset: string,
    delta: string,
    kind: LedgerKind,
    reference: string | null,
    within?: EntityManager,
  ): Promise<void> {
    const change = async (manager: EntityManager): Promise<void> => {
      const result = await manager.query(
        'UPDATE wallets SET balance = balance + ? WHERE userId = ? AND asset = ? AND balance + ? >= 0',
        [delta, userId, asset, delta],
      );
      if (result.affectedRows !== 1) {
        throw new ConflictException(
          `The ${asset} balance cannot change by ${toDecimal(delta, scaleOf(asset))}`,
        );
      }
      await manager.getRepository(LedgerEntryEntity).insert({
        userId,
        asset,
        amount: delta,
        kind,
        reference,
        createdAt: new Date(),
      });
    };
    if (within === undefined) {
      await this.dataSource.transaction(change);
    } else {
      await change(within);
    }
  }

  /** What a user holds of an asset, in minor units, for a caller that has already settled authorization. */
  async balanceOf(userId: string, asset: string): Promise<string> {
    const row = await this.dataSource.getRepository(WalletEntity).findOneBy({
      userId,
      asset,
    });
    if (row === null) {
      throw new NotFoundException(`There is no ${asset} wallet for ${userId}`);
    }
    return row.balance;
  }

  /** The wallets a list of users holds of an asset. */
  async ofUsers(users: string[], asset: string): Promise<Wallet[]> {
    const rows = await this.dataSource.getRepository(WalletEntity).find({
      where: { userId: In(users), asset },
      order: { userId: 'ASC' },
    });
    return rows.map(toWallet);
  }
}
