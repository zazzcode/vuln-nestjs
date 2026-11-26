import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '../orders/order.entity.js';
import { MysqlStore } from './mysql.store.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [MysqlStore],
      // The factory waits for the engine, so nothing reaches the store before it is up.
      useFactory: async (store: MysqlStore) => ({
        type: 'mysql' as const,
        ...(await store.open()),
        entities: [OrderEntity],
        // Every store is ephemeral, so the entities are the schema. There are no migrations.
        synchronize: true,
        // Queries contain user data.
        logging: false,
      }),
    }),
  ],
  providers: [MysqlStore],
  exports: [MysqlStore, TypeOrmModule],
})
export class DatabaseModule {}
