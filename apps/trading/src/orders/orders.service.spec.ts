import { labStart } from '@zazzles/exchange-lab-data';
import {
  OrderEntity,
  OrderSide,
  OrderStatus,
  OrderType,
} from './order.entity.js';
import type { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

const aliceOrder: OrderEntity = {
  id: 1,
  userId: 'u-alice',
  symbol: 'BTC-USD',
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  limitPrice: '6400000',
  quantity: '50000000',
  memo: null,
  status: OrderStatus.OPEN,
  createdAt: labStart,
  updatedAt: labStart,
};

/** A repository that holds the given rows and does nothing else: the service is tested without a store. */
const repositoryHolding = (rows: OrderEntity[]): OrdersRepository =>
  ({
    findByUser: (userId: string) =>
      Promise.resolve(rows.filter((row) => row.userId === userId)),
    findById: (id: number) =>
      Promise.resolve(rows.find((row) => row.id === id) ?? null),
  }) as unknown as OrdersRepository;

describe('OrdersService', () => {
  // Money is stored as integers in minor units and leaves as decimal strings, each at its asset's scale.
  it('carries money out of the store as decimal strings, at the scale of its asset', async () => {
    expect(
      await new OrdersService(repositoryHolding([aliceOrder])).byId(1),
    ).toEqual({
      id: '1',
      userId: 'u-alice',
      symbol: 'BTC-USD',
      limitPrice: '64000.00',
      quantity: '0.50000000',
      status: OrderStatus.OPEN,
    });
  });

  it('answers only the orders of the user asked for', async () => {
    const bobsOrder: OrderEntity = Object.assign(
      new OrderEntity(),
      aliceOrder,
      { id: 2, userId: 'u-bob' },
    );
    const orders = await new OrdersService(
      repositoryHolding([aliceOrder, bobsOrder]),
    ).byUser('u-bob');

    expect(orders.map((order) => order.id)).toEqual(['2']);
  });

  it('answers nothing for an order that is not stored', async () => {
    expect(
      await new OrdersService(repositoryHolding([aliceOrder])).byId(99),
    ).toBeNull();
  });
});
