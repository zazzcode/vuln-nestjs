import { Global, Module } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DATABASE, MongoStore } from './mongo.store.js';

/** The database, as a repository declares it: `@Inject(MONGO_DATABASE) database: MongoDatabase`. */
export type MongoDatabase = Db;

@Global()
@Module({
  providers: [
    MongoStore,
    {
      provide: MONGO_DATABASE,
      inject: [MongoStore],
      // The factory waits for the engine, so nothing reaches the store before it is up.
      useFactory: (store: MongoStore) => store.open(),
    },
  ],
  exports: [MONGO_DATABASE, MongoStore],
})
export class DatabaseModule {}
