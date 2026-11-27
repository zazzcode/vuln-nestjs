import type { AuthenticatedRequest } from './request.js';
import type { TokenPayload } from './token.js';
import type { TokenVerifier } from './token-verifier.js';

/** The context of every GraphQL request: the request, and the caller when the request's token verifies. */
export interface GraphContext {
  req: AuthenticatedRequest;
  user?: TokenPayload;
}

/** What the Apollo driver passes: the HTTP request itself, or an object that holds it as `req`. */
type RequestCarrier =
  Partial<AuthenticatedRequest> | { req: AuthenticatedRequest } | undefined;

/**
 * The `context` option of a service's GraphQL module:
 *
 *     GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
 *       driver: ApolloFederationDriver,
 *       inject: [TokenVerifier],
 *       useFactory: (verifier: TokenVerifier) => ({ …, context: graphContext(verifier) }),
 *     })
 *
 * The global guard runs for REST routes and for root operations, and for no
 * other resolver: neither for a field resolver nor for an entity reference,
 * which is how the gateway reaches the fields a service adds to another
 * service's entity. Attaching the caller here is what makes `@CurrentUser()`
 * answer in every resolver. A token that does not verify leaves the caller
 * unset: nothing refuses a request on its way to an operation.
 */
export function graphContext(
  verifier: TokenVerifier,
): (carrier: RequestCarrier) => Promise<Partial<GraphContext>> {
  return async (carrier) => {
    const req = requestOf(carrier);
    const user = await verifier.callerOf(req);
    return user === undefined ? {} : { user };
  };
}

function requestOf(carrier: RequestCarrier): AuthenticatedRequest {
  const held = (carrier as { req?: AuthenticatedRequest } | undefined)?.req;
  return held ?? (carrier as AuthenticatedRequest);
}
