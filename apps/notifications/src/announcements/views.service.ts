import { Injectable, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Express } from 'express';
import path from 'node:path';

/**
 * Where the fixed templates live: `apps/notifications/views`, resolved from
 * this module's own directory, the same relative path from `src/` and from
 * `dist/`. The build emits JavaScript and nothing else.
 */
export const VIEWS_DIRECTORY = path.resolve(
  import.meta.dirname,
  '../../../views',
);

/**
 * Teaches the Express instance to render `ejs` views: the engine and the
 * directory are set on the adapter itself, so `res.render()` works wherever
 * the application was created from, in a test as in `main.ts`.
 */
@Injectable()
export class ViewsService implements OnModuleInit {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance<Express>();
    instance.set('view engine', 'ejs');
    instance.set('views', VIEWS_DIRECTORY);
  }
}
