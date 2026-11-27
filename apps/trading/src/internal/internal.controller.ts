import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Roles, UserId } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DOLLAR_SCALE, requireAboveZero } from '../money/money.js';
import { MarketsService } from '../markets/markets.service.js';
import { OrderEntity } from '../orders/order.entity.js';
import { toOrder } from '../orders/orders.service.js';
import {
  LedgerEntryEntity,
  LedgerKind,
} from '../wallets/ledger-entry.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { DepositDto, WithdrawDto } from './dto.js';

/**
 * The REST surface the gateway forwards to: the system's deposits and price
 * ticks, a user's own withdrawal, and a user's own order update. Every route
 * carries the caller the guards attached; the two `/admin` routes need the
 * administrator's role.
 */
@Controller('internal')
export class InternalController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
    private readonly markets: MarketsService,
  ) {}

  /** An administrator credits a wallet. The amount must be above zero. */
  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/deposits')
  async deposit(@Body() dto: DepositDto) {
    const minor = requireAboveZero(dto.amount, DOLLAR_SCALE);
    await this.wallets.adjust(
      dto.userId,
      'USD',
      minor,
      LedgerKind.DEPOSIT,
      'deposit',
    );
    return { wallets: await this.wallets.ofUser(dto.userId) };
  }

  /** An administrator moves every reference price, filling crossed orders. */
  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/prices/tick')
  async tick() {
    return { markets: await this.markets.tick() };
  }

  /**
   * The caller withdraws from their own dollar wallet. The balance row is
   * locked with `SELECT … FOR UPDATE` for the whole transaction: ten parallel
   * withdrawals of one balance answer once and refuse nine.
   */
  @HttpCode(200)
  @Post('wallets/withdraw')
  async withdraw(@UserId() caller: string, @Body() dto: WithdrawDto) {
    const minor = requireAboveZero(dto.amount, DOLLAR_SCALE);
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<{ id: number; balance: string }>>(
        'SELECT id, balance FROM wallets WHERE userId = ? AND asset = ? FOR UPDATE',
        [caller, 'USD'],
      );
      const row = rows[0];
      if (row === undefined) {
        throw new NotFoundException(`There is no USD wallet for ${caller}`);
      }
      if (BigInt(row.balance) < BigInt(minor)) {
        throw new BadRequestException(`The USD balance is below ${dto.amount}`);
      }
      await manager.query(
        'UPDATE wallets SET balance = balance - ? WHERE id = ?',
        [minor, row.id],
      );
      await manager.insert(LedgerEntryEntity, {
        userId: caller,
        asset: 'USD',
        amount: `-${minor}`,
        kind: LedgerKind.WITHDRAWAL,
        reference: 'withdrawal',
        createdAt: new Date(),
      });
    });
    return { wallets: await this.wallets.ofUser(caller) };
  }

  /**
   * The caller changes the memo of their own order. The whitelist is the
   * field itself: `memo` is read by name, and nothing else in the body is
   * ever read, so a property the caller adds goes nowhere.
   */
  @HttpCode(200)
  @Put('orders/:id')
  async updateOrder(
    @UserId() caller: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const order = await this.dataSource
      .getRepository(OrderEntity)
      .findOneBy({ id });
    if (order === null) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    if (order.userId !== caller) {
      throw new ForbiddenException(
        'An order is changed by the user who placed it',
      );
    }
    if (typeof body.memo === 'string') {
      order.memo = body.memo;
      order.updatedAt = new Date();
      await this.dataSource.getRepository(OrderEntity).save(order);
    }
    return { order: toOrder(order) };
  }
}
