import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Args, ID, InputType, Mutation, Resolver } from '@nestjs/graphql';
import { Field } from '@nestjs/graphql';
import { IsOptional, IsString } from 'class-validator';
import { UserId } from '@zazzles/exchange-internal-auth';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';

/** What a caller may change on an order they placed. `memo` is the only field. */
@InputType()
export class UpdateOrderInput {
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memo?: string;
}

/** Changes the memo of an order, for the user who placed it. */
@Resolver()
export class UpdateOrderResolver {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly rows: Repository<OrderEntity>,
  ) {}

  @Mutation(() => Order)
  async updateOrder(
    @UserId() caller: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateOrderInput }) input: UpdateOrderInput,
  ): Promise<Order> {
    const whole = Number(id);
    if (!Number.isInteger(whole)) {
      throw new BadRequestException(
        `An order is asked for by its number: ${JSON.stringify(id)} is not one`,
      );
    }
    const order = await this.rows.findOneBy({ id: whole });
    if (order === null) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    if (order.userId !== caller) {
      throw new ForbiddenException(
        'An order is changed by the user who placed it',
      );
    }
    // Only the field `UpdateOrderInput` declares reaches this point: the input
    // schema has `memo` alone, and the validation pipe refuses the rest.
    order.memo = input.memo ?? order.memo;
    order.updatedAt = new Date();
    await this.rows.save(order);
    return toOrder(order);
  }
}
