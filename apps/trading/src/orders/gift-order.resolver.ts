import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Order } from './order.model.js';
import { PlaceOrderInput, PlaceOrderResolver } from './place-order.resolver.js';

/** Places an order for a user of the caller's choosing. */
@Resolver()
export class GiftOrderResolver {
  constructor(private readonly placed: PlaceOrderResolver) {}

  @Mutation(() => Order)
  async giftOrder(
    @UserId() caller: string,
    @Args('toUserId', { type: () => ID }) toUserId: string,
    @Args('input', { type: () => PlaceOrderInput }) input: PlaceOrderInput,
  ): Promise<Order> {
    const order = await this.placed.placeOrder(caller, input);
    return {
      id: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      limitPrice: order.limitPrice,
      quantity: order.quantity,
      memo: order.memo,
      status: order.status,
      createdAt: order.createdAt,
      // GQL-006 / CWE-639: the user reference is built from the caller's argument, not from the stored order
      user: { id: toUserId, orders: [] },
    };
  }
}
