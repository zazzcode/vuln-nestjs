import { ExpressAdapter } from '@nestjs/platform-express';
import { startService, type ServiceHandle } from '@zazzles/exchange-testing';
import { AppModule } from '../../src/app.module.js';

/**
 * How every test of this service starts it: the Express adapter, the test
 * port, and the same application options `main.ts` creates the process
 * with. `bodyParser: false` is what makes `JsonBodyMiddleware` the real
 * parser — Nest's default parser would otherwise parse every JSON body
 * first. This file and `main.ts` are what must agree.
 */
export function startNotificationsService(port = 3103): Promise<ServiceHandle> {
  return startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port,
    applicationOptions: { bodyParser: false },
  });
}
