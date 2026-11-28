import type { ApolloServerPlugin } from '@apollo/server';
import { BREAK, GraphQLError, visit, type DocumentNode } from 'graphql';
import {
  SERVICE_TOKEN_HEADER,
  sameSecret,
} from '@zazzles/exchange-internal-auth';

/** The two queries a subgraph answers for its gateway: `_service` at composition, `_entities` at every join. */
const FEDERATION_QUERIES: readonly string[] = ['_entities', '_service'];

/**
 * Whether the operation asks for a federation query, wherever it is
 * selected: at the root, under an alias, or through a fragment.
 */
function asksForAFederationQuery(document: DocumentNode): boolean {
  let asked = false;
  visit(document, {
    Field(field) {
      if (FEDERATION_QUERIES.includes(field.name.value)) {
        asked = true;
        return BREAK;
      }
      return undefined;
    },
  });
  return asked;
}

/**
 * The counterpart of a subgraph that answers its federation queries to any
 * caller. Apollo adds `_service` and `_entities` to a subgraph's schema
 * itself, outside the resolvers Nest's global guard runs for, so nothing
 * asks who is calling. Registered in a subgraph's GraphQL module, this
 * plugin asks: an operation that selects either query is answered only to a
 * caller presenting the internal service token, which the gateway does on
 * every fetch. Any other caller is refused before a resolver runs, whatever
 * else its request carries.
 */
export function federationQueriesNeedTheToken(
  service: string,
  expectedToken: string,
): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        // Called once the operation is parsed and validated, and before any resolver runs.
        async didResolveOperation({ request, document }) {
          if (!asksForAFederationQuery(document)) {
            return;
          }
          const given = request.http?.headers.get(SERVICE_TOKEN_HEADER);
          if (given !== undefined && sameSecret(given, expectedToken)) {
            return;
          }
          throw new GraphQLError(
            `${service} answers its federation queries to the gateway only`,
            { extensions: { code: 'FORBIDDEN', http: { status: 403 } } },
          );
        },
      };
    },
  };
}
