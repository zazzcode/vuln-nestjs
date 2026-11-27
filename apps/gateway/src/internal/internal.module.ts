import { Module } from '@nestjs/common';
import { Http2Module } from '@zazzles/exchange-http2';
import { InternalClientService } from './internal-client.service.js';

@Module({
  imports: [Http2Module],
  providers: [InternalClientService],
  exports: [InternalClientService],
})
export class InternalModule {}
