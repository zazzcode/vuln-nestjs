import { Module } from '@nestjs/common';
import {
  ApolloFederationDriver,
  type ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { SharedScalarsModule } from '@zazzles/exchange-graphql';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';

/** The generated schema of this subgraph, at `apps/accounts/schema.gql` whatever the working directory. */
export const SCHEMA_FILE = fileURLToPath(
  new URL('../../schema.gql', import.meta.url),
);

/** This service's part of the graph, code first, as a federation subgraph. */
@Module({
  imports: [
    SharedScalarsModule,
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      // Without a path the driver generates the schema in memory and writes no file.
      autoSchemaFile: { federation: 2, path: SCHEMA_FILE },
      // The guards read the token from the request, so the request travels in the resolver's context.
      context: ({ req }: { req: IncomingMessage }) => ({ req }),
    }),
  ],
})
export class GraphqlModule {}
