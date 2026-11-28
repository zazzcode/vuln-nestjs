import { Injectable, type NestMiddleware } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * The JSON body parser of this service, as an Express idiom: a NestJS
 * middleware class, applied to every route that receives a JSON body. The
 * application is created with `bodyParser: false`, so this middleware is
 * the parser. GraphQL does not parse its own body: Apollo reads what the
 * framework parsed.
 */
@Injectable()
export class JsonBodyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    json()(request, _response, next);
  }
}
