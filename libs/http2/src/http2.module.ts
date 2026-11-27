import { Global, Module } from '@nestjs/common';
import { Http2ClientService } from './http2-client.service.js';

/** Only the gateway imports this: a backend service never calls another. */
@Global()
@Module({
  providers: [Http2ClientService],
  exports: [Http2ClientService],
})
export class Http2Module {}
