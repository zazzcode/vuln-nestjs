import { Module } from '@nestjs/common';
import { ConvertExactResolver } from './convert-exact.resolver.js';
import { ConvertResolver } from './convert.resolver.js';

/** Money helpers of this service, and the operations that present them. */
@Module({
  providers: [ConvertResolver, ConvertExactResolver],
})
export class MoneyModule {}
