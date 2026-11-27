import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import * as ejs from 'ejs';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  CurrentUser,
  Roles,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { AnnouncementInput } from './announcement.input.js';
import { AnnouncementsService } from './announcements.service.js';
import { DeliveryService } from '../webhooks/delivery.service.js';

const run = promisify(exec);

/** The service's own directory: the notifier command is run from here, so `scripts/` resolves. */
export const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Sends an announcement by running the notifier command once per recipient,
 * with the announcement's title and body on its command line. A convenience
 * for an administrator who wants the same log line on every host.
 */
@Controller('internal/announcements')
export class AnnouncementsSendController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly deliveries: DeliveryService,
  ) {}

  /** An administrator's operation. `201` with the announcement and the delivery records. */
  @Roles('ADMIN')
  @Post('send')
  @HttpCode(201)
  async send(
    @CurrentUser() caller: TokenPayload,
    @Body() input: AnnouncementInput,
  ) {
    const announcement = await this.announcements.create(caller.sub, input);
    const records = await this.deliveries.toRecipients(
      async (settings, url) => {
        const rendered = ejs.render(input.body, {
          user: settings,
          title: input.title,
        }); // DESER-003 / CWE-1336: the caller's body is compiled as a template, so its tags run
        const command = `node scripts/notify.js --title "${input.title}" --body "${rendered}" --url "${url}"`; // OS-001 / CWE-78: the title is interpolated into a command line the shell reads
        try {
          const { stdout } = await run(command, { cwd: SERVICE_ROOT });
          return {
            url,
            status: 'DELIVERED' as const,
            lastError: null,
            responseBody: stdout,
            deliveredAt: new Date(),
          };
        } catch (error) {
          const failure = error as { stderr?: string; message?: string };
          return {
            url,
            status: 'FAILED' as const,
            lastError:
              failure.stderr ??
              failure.message ??
              'the notifier command failed',
            responseBody: null,
            deliveredAt: null,
          };
        }
      },
    );
    return { announcement, deliveries: records };
  }
}
