import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { Http2Module } from '@zazzles/exchange-http2';
import { Environment } from './config/environment.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { InternalModule } from './internal/internal.module.js';
import { LabModule } from './lab/lab.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    Http2Module,
    InternalModule,
    LabModule,
    GraphqlModule,
  ],
})
export class AppModule {}
