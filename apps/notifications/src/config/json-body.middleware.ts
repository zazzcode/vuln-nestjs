import { Injectable, type NestMiddleware } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * The JSON body parser of this service, as an Express idiom: a NestJS
 * middleware class, applied to the `/internal` routes that receive a JSON
 * body. GraphQL parses its own body.
 */
@Injectable()
export class JsonBodyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    json()(request, _response, next);
  }
}
