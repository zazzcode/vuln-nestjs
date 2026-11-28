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

/** The generated schema of this subgraph, at `apps/accounts/schema.gql` whatever the working directory. */
export const SCHEMA_FILE = fileURLToPath(
  new URL('../../schema.gql', import.meta.url),
);

/** This service's part of the graph, code first, as a federation subgraph. */
@Module({
  imports: [
    SharedScalarsModule,
    GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      inject: [TokenVerifier],
      useFactory: (verifier: TokenVerifier) => ({
        // GQL-007 / CWE-306: the federation queries `_service` and `_entities`
        // are added to this schema by Apollo itself, outside the resolvers the
        // global guard runs for, and nothing here asks for a credential on
        // them: a direct call with none reads any user by key, where
        // `user(id)` is an administrator's question. Hardened value: require
        // `x-internal-token` on both, as trading's GraphQL module does.
        // Without a path the driver generates the schema in memory and writes no file.
        autoSchemaFile: { federation: 2, path: SCHEMA_FILE },
        // The request travels in the context of every resolver, with the caller attached when the token verifies.
        context: graphContext(verifier),
        // The lab's error codes, in `extensions.code`, for every resolver.
        formatError: formatGraphQLError,
      }),
    }),
  ],
})
export class GraphqlModule {}
