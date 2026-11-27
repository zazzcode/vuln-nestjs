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

/**
 * `@apollo/gateway` collects facts about the machine it runs on (the operating
 * system, the CPU, the memory, the cloud provider it detects) and exports them
 * to Apollo every hour, unless it is told not to. The lab sends no telemetry.
 * It is told not to here, in its own code and before anything constructs a
 * gateway, so that this holds however the service is started.
 */
process.env.APOLLO_TELEMETRY_DISABLED = 'true';

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
          // GQL-001 / CWE-200: introspection is served to anyone who asks.
          // Hardened value: `introspection: false`.
          introspection: true,
          // GQL-001 / CWE-200: the GraphiQL IDE is served to any browser that
          // opens the endpoint. Hardened value: `graphiql: false`.
          graphiql: true,
          server: {
            // The lab's error codes, in `extensions.code`.
            formatError: formatGraphQLError,
            // GQL-002 / CWE-770: no `validationRules`, so no depth or
            // complexity limit: a query nested to any depth is accepted and
            // planned. Hardened value: a depth rule with a limit of 5.
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
              return new SubgraphDataSource(
                subgraph.name,
                subgraph.url,
                http2,
                environment.INTERNAL_SERVICE_TOKEN,
              );
            },
          },
        };
      },
    }),
  ],
})
export class GraphqlModule {}
