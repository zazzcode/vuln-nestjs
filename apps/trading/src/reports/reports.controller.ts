import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import type { FastifyReply } from 'fastify';
import { DataSource } from 'typeorm';
import { DOLLAR_SCALE, COIN_SCALE, toDecimal } from '../money/money.js';
import { OrderEntity } from '../orders/order.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';
import { ReportsService, resolveWithinReports } from './reports.service.js';

/** One row of the trades export. */
interface ExportRow {
  readonly t_id: number;
  readonly t_symbol: string;
  readonly t_side: string;
  readonly t_price: string;
  readonly t_quantity: string;
  readonly t_fee: string;
  readonly o_memo: string | null;
}

/** A cell that begins like a formula says so as text: a leading `= + - @` is prefixed with an apostrophe. */
const asText = (value: string | null): string => {
  const text = value ?? '';
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
};

const rowOf = (row: ExportRow) => [
  String(row.t_id),
  row.t_symbol,
  row.t_side,
  toDecimal(row.t_price, DOLLAR_SCALE),
  toDecimal(row.t_quantity, COIN_SCALE),
  toDecimal(row.t_fee, DOLLAR_SCALE),
];

/** The reports of the caller: the statement the service stored, and the trade exports. */
@Controller('internal/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** A report by its id. The file's name comes from the database row, never from the caller. */
  @Get(':id')
  async byId(@UserId() caller: string, @Param('id', ParseIntPipe) id: number) {
    const row = await this.reports.byId(id);
    if (row === null || row.userId !== caller) {
      throw new NotFoundException(`There is no report ${id}`);
    }
    return {
      report: {
        id: String(row.id),
        userId: row.userId,
        kind: row.kind,
        storedName: row.storedName,
        createdAt: row.createdAt,
      },
    };
  }

  /**
   * A stored report file. The name is resolved under the run's reports
   * directory and checked to stay inside it, and then it must be the stored
   * name of one of the caller's own reports.
   */
  @Get('file/:name')
  async file(
    @UserId() caller: string,
    @Param('name') name: string,
    @Res() reply: FastifyReply,
  ) {
    resolveWithinReports(name);
    const contents = await this.reports.fileOf(caller, name);
    reply.header('content-type', 'text/csv').send(contents);
  }

  /** The caller's trades as CSV, every cell text: a memo that begins like a formula is prefixed. */
  @Get('trades.csv')
  async tradesCsv(@UserId() caller: string, @Res() reply: FastifyReply) {
    const rows = await this.exportsOf(caller);
    const lines = ['id,symbol,side,price,quantity,fee,memo'];
    for (const row of rows) {
      lines.push([...rowOf(row), asText(row.o_memo)].join(','));
    }
    reply.header('content-type', 'text/csv').send(`${lines.join('\n')}\n`);
  }

  /** The caller's trades as JSON: data, an attachment, nothing a spreadsheet parses as a formula. */
  @Get('trades.json')
  async tradesJson(@UserId() caller: string, @Res() reply: FastifyReply) {
    const rows = await this.exportsOf(caller);
    reply
      .header('content-type', 'application/json')
      .header('content-disposition', 'attachment; filename="trades.json"')
      .send(
        JSON.stringify({
          trades: rows.map((row) => ({
            id: String(row.t_id),
            symbol: row.t_symbol,
            side: row.t_side,
            price: toDecimal(row.t_price, DOLLAR_SCALE),
            quantity: toDecimal(row.t_quantity, COIN_SCALE),
            fee: toDecimal(row.t_fee, DOLLAR_SCALE),
            memo: row.o_memo,
          })),
        }),
      );
  }

  private exportsOf(caller: string): Promise<ExportRow[]> {
    return this.dataSource
      .getRepository(TradeEntity)
      .createQueryBuilder('t')
      .innerJoin(OrderEntity, 'o', 'o.id = t.orderId')
      .addSelect('o.memo', 'o_memo')
      .where('t.userId = :caller', { caller })
      .orderBy('t.id', 'ASC')
      .getRawMany<ExportRow>();
  }
}
