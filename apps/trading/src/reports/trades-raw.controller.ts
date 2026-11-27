import { Controller, Get, Res } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import type { FastifyReply } from 'fastify';
import { DataSource } from 'typeorm';
import { OrderEntity } from '../orders/order.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';

interface ExportRow {
  readonly t_id: number;
  readonly t_symbol: string;
  readonly t_side: string;
  readonly t_price: string;
  readonly t_quantity: string;
  readonly t_fee: string;
  readonly o_memo: string | null;
}

/** The caller's trades as the spreadsheet takes them, cell for cell. */
@Controller('internal/reports')
export class TradesRawController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get('trades-raw.csv')
  async tradesRaw(@UserId() caller: string, @Res() reply: FastifyReply) {
    const rows: ExportRow[] = await this.dataSource
      .getRepository(TradeEntity)
      .createQueryBuilder('t')
      .innerJoin(OrderEntity, 'o', 'o.id = t.orderId')
      .addSelect('o.memo', 'o_memo')
      .where('t.userId = :caller', { caller })
      .orderBy('t.id', 'ASC')
      .getRawMany();
    const lines = ['id,symbol,side,price,quantity,fee,memo'];
    for (const row of rows) {
      // INJECT-001 / CWE-1236: the memo is written to the CSV as it is; a cell that starts with = is a formula
      lines.push(
        [
          String(row.t_id),
          row.t_symbol,
          row.t_side,
          row.t_price,
          row.t_quantity,
          row.t_fee,
          row.o_memo ?? '',
        ].join(','),
      );
    }
    reply.header('content-type', 'text/csv').send(`${lines.join('\n')}\n`);
  }
}
