import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MaskedExceptionFilter } from './mask-exception.filter.js';

/** Registers the edge's exception filter, which masks what a caller reads of an error. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: MaskedExceptionFilter }],
})
export class EdgeModule {}
