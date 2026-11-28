import { Module } from '@nestjs/common';
import {
  ApolloFederationDriver,
  type ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import {
  SharedScalarsModule,
  formatGraphQLError,
} from '@zazzles/exchange-graphql';
import { TokenVerifier, graphContext } from '@zazzles/exchange-internal-auth';
import { fileURLToPath } from 'node:url';
import { Environment } from '../config/environment.js';
import { registerGraphEnums } from './enums.js';
import { federationQueriesNeedTheToken } from './federation-queries.plugin.js';

registerGraphEnums();

/** The generated schema of this subgraph, at `apps/trading/schema.gql` whatever the working directory. */
export const SCHEMA_FILE = fileURLToPath(
  new URL('../../schema.gql', import.meta.url),
);

/** This service's part of the graph, code first, as a federation subgraph. */
@Module({
  imports: [
    SharedScalarsModule,
    GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      inject: [TokenVerifier, Environment],
      useFactory: (verifier: TokenVerifier, environment: Environment) => ({
        // Without a path the driver generates the schema in memory and writes no file.
        autoSchemaFile: { federation: 2, path: SCHEMA_FILE },
        // The request travels in the context of every resolver, with the caller attached when the token verifies.
        context: graphContext(verifier),
        // The lab's error codes, in `extensions.code`, for every resolver.
        formatError: formatGraphQLError,
        // GQL-007, the counterpart: `_entities` and `_service` answer only to
        // a caller presenting the internal service token. Without this
        // option the federation queries answer any caller, as they do in
        // accounts and notifications: Apollo adds the two to the schema
        // outside the resolvers the global guard runs for.
        plugins: [
          federationQueriesNeedTheToken(
            'trading',
            environment.INTERNAL_SERVICE_TOKEN,
          ),
        ],
      }),
    }),
  ],
})
export class GraphqlModule {}
