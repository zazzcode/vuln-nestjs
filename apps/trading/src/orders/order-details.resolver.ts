import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { OrdersService } from './orders.service.js';
import { Order } from './order.model.js';

/** One order, with everything on it. */
@Resolver()
export class OrderDetailsResolver {
  constructor(private readonly orders: OrdersService) {}

  @Query(() => Order, { nullable: true })
  async orderDetails(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order | null> {
    const whole = Number(id);
    if (!Number.isInteger(whole)) {
      throw new BadRequestException(
        `An order is asked for by its number: ${JSON.stringify(id)} is not one`,
      );
    }
    // ACCESS-002 / CWE-639: the order is returned with no check of who placed it
    const order = await this.orders.byId(whole);
    if (order === null) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    return order;
  }
}
