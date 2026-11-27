import { Module } from '@nestjs/common';
import { DateTimeScalar, DecimalScalar, JsonScalar } from './scalars.js';

/**
 * The three scalars every subgraph defines with the same name and the same
 * behaviour, so that a value one service serialises another one accepts.
 */
@Module({
  providers: [DecimalScalar, DateTimeScalar, JsonScalar],
})
export class SharedScalarsModule {}
