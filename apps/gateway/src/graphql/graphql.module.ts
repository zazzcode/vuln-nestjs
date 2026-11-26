import { Module } from '@nestjs/common';
import {
  ApolloGatewayDriver,
  type ApolloGatewayDriverConfig,
} from '@nestjs/apollo';
import { IntrospectAndCompose } from '@apollo/gateway';
import { GraphQLModule } from '@nestjs/graphql';
import { formatGraphQLError } from '@zazzles/exchange-graphql';
import { Http2ClientService } from '@zazzles/exchange-http2';
import { serviceUrl } from '@zazzles/exchange-config';
import { Environment } from '../config/environment.js';
import { BACKENDS, portOf } from '../config/ports.js';
import { SubgraphDataSource } from './subgraph-data.source.js';

/** Every subgraph of the graph, on the port this gateway reaches it on. */
function subgraphsOf(environment: Environment) {
  return BACKENDS.map((service) => ({
    name: service,
    url: `${serviceUrl(service, portOf(environment, service))}/graphql`,
  }));
}

/**
 * The graph: composed at start from the three subgraphs. A request is planned
 * here and answered by the service that owns each field. Nothing is resolved
 * in this gateway.
 */
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      inject: [Environment, Http2ClientService],
      useFactory: (environment: Environment, http2: Http2ClientService) => {
        const subgraphs = subgraphsOf(environment);
        return {
          server: {
            // The lab's error codes, in `extensions.code`.
            formatError: formatGraphQLError,
            // What identifies the caller travels to the service that owns each field.
            context: (request: { headers: Record<string, string> }) => ({
              headers: request.headers,
            }),
          },
          gateway: {
            // For an application that lives for minutes, composing at start removes a build step.
            supergraphSdl: new IntrospectAndCompose({ subgraphs }),
            buildService: ({ name }) => {
              const subgraph = subgraphs.find(
                (candidate) => candidate.name === name,
              ) as (typeof subgraphs)[number];
              return new SubgraphDataSource(subgraph.name, subgraph.url, http2);
            },
          },
        };
      },
    }),
  ],
})
export class GraphqlModule {}
