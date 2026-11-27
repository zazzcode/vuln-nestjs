import { Module } from '@nestjs/common';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { Http2Module } from '@zazzles/exchange-http2';
import { ApiDocsModule } from './api-docs/api-docs.module.js';
import { Environment } from './config/environment.js';
import { DebugModule } from './debug/debug.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { EdgeModule } from './edge/edge.module.js';
import { GraphqlModule } from './graphql/graphql.module.js';
import { InternalModule } from './internal/internal.module.js';
import { LabModule } from './lab/lab.module.js';
import { MarketsModule } from './markets/markets.module.js';
import { OpenapiModule } from './openapi/openapi.module.js';
import { PassthroughModule } from './passthrough/passthrough.module.js';
import { PublicApiModule } from './public-api/public-api.module.js';
import { PreferencesModule } from './profile/preferences.module.js';
import { RedirectsModule } from './redirects/redirects.module.js';
import { StatusModule } from './status/status.module.js';

@Module({
  imports: [
    EnvironmentModule.forRoot(Environment),
    AuthModule,
    Http2Module,
    InternalModule,
    LabModule,
    GraphqlModule,
    EdgeModule,
    StatusModule,
    MarketsModule,
    OpenapiModule,
    DiagnosticsModule,
    RedirectsModule,
    PreferencesModule,
    PassthroughModule,
    PublicApiModule,
    ApiDocsModule,
    DebugModule,
  ],
})
export class AppModule {}
