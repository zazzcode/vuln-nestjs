import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { toOrder } from './orders.service.js';

/** A caller changes an order of theirs, field by field. */
@Controller('internal/orders')
export class OrdersPatchController {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly rows: Repository<OrderEntity>,
  ) {}

  @HttpCode(200)
  @Patch(':id')
  async patch(
    @UserId() caller: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    const order = await this.rows.findOneBy({ id });
    if (order === null) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    if (order.userId !== caller) {
      return { order: toOrder(order) };
    }
    // ACCESS-010 / CWE-915: the body is merged into the entity as it arrived; status and userId are properties of it
    Object.assign(order, body);
    await this.rows.save(order);
    return { order: toOrder(order) };
  }
}
