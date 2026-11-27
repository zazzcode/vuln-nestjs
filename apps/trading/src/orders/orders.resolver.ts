import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Args,
  ID,
  Parent,
  Query,
  ResolveField,
  ResolveReference,
  Resolver,
} from '@nestjs/graphql';
import {
  CurrentUser,
  UserId,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { Order } from './order.model.js';
import { OrdersService } from './orders.service.js';
import { User } from './user.model.js';

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private readonly orders: OrdersService) {}

  /** The caller's orders. */
  @Query(() => [Order], { name: 'orders' })
  placedByCaller(@UserId() userId: string): Promise<Order[]> {
    return this.orders.byUser(userId);
  }

  /**
   * One order by its id. The repository answers, then the order is checked
   * against the caller: an id that is not a whole number is refused before the
   * store is asked anything.
   */
  @Query(() => Order, { nullable: true })
  async order(
    @CurrentUser() caller: TokenPayload,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order | null> {
    const whole = Number(id);
    if (!Number.isInteger(whole)) {
      throw new BadRequestException(
        `An order is asked for by its number: ${JSON.stringify(id)} is not one`,
      );
    }
    const order = await this.orders.byId(whole);
    if (order === null) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    if (order.userId !== caller.sub && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'An order is read by the user who placed it',
      );
    }
    return order;
  }

  /**
   * The gateway asks for an order by key. An order is read by who placed it,
   * or by an administrator. The representation is the parent.
   * This resolver is reached without the guard: it refuses for itself.
   */
  @ResolveReference()
  async reference(
    @Parent() reference: { id: string },
    @CurrentUser() caller: TokenPayload,
  ): Promise<Order> {
    const order = await this.orders.byId(Number(reference.id));
    if (order === null) {
      throw new NotFoundException(`There is no order ${reference.id}`);
    }
    if (order.userId !== caller.sub && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'An order is read by the user who placed it',
      );
    }
    return order;
  }

  /**
   * The order's user, as a reference built from what is stored. A stored order
   * carries its own reference already; one that a resolver provided keeps it.
   */
  @ResolveField(() => User)
  user(@Parent() order: Order): User {
    return order.user ?? { id: order.userId, orders: [] };
  }
}

/** The part of the user entity this service adds: the orders a user placed. */
@Resolver(() => User)
export class UserOrdersResolver {
  constructor(private readonly orders: OrdersService) {}

  /** The gateway asks for the user's own fields when a query reaches a user this service did not provide. */
  @ResolveReference()
  reference(@Parent() reference: { id: string }): User {
    return { id: reference.id, orders: [] };
  }

  /**
   * A user's orders, for that user or for an administrator. The reference
   * names a user the caller did not choose, so it is checked against the caller.
   */
  @ResolveField('orders', () => [Order])
  placedByUser(
    @CurrentUser() caller: TokenPayload,
    @Parent() user: User,
  ): Promise<Order[]> {
    if (caller.sub !== user.id && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Orders are read by the user who placed them',
      );
    }
    return this.orders.byUser(user.id);
  }
}
