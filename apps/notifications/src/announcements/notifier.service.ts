import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { OutcomeFields } from '../webhooks/webhook-client.service.js';
import { renderNotice, type NoticeInput } from './notice.service.js';

const run = promisify(execFile);

/** The notifier command of this service, resolved from the module's own directory. */
export const NOTIFY_SCRIPT = path.resolve(
  import.meta.dirname,
  '../../../scripts/notify.js',
);

/**
 * Sends a notice by running the notifier command with a fixed argument
 * vector: one argument per value, so no value can become part of the command
 * line the shell would read.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  /**
   * One notice to one URL. The command is `node scripts/notify.js --title
   * <title> --body <rendered notice> --url <url>`, one argument per value.
   * The delivery ended as delivered when the command exited 0, with what it
   * printed as the answer's body.
   */
  async sendWithVector(
    input: NoticeInput,
    url: string,
  ): Promise<OutcomeFields> {
    const notice = await renderNotice(input);
    try {
      const { stdout } = await run(process.execPath, [
        NOTIFY_SCRIPT,
        '--title',
        input.title,
        '--body',
        notice,
        '--url',
        url,
      ]);
      return {
        status: 'DELIVERED',
        lastError: null,
        responseBody: stdout,
        deliveredAt: new Date(),
      };
    } catch (error) {
      const failure = error as { stderr?: string; message?: string };
      this.logger.warn(
        `the notifier command failed: ${failure.message ?? 'unknown error'}`,
      );
      return {
        status: 'FAILED',
        lastError:
          failure.stderr ?? failure.message ?? 'the notifier command failed',
        responseBody: null,
        deliveredAt: null,
      };
    }
  }
}
