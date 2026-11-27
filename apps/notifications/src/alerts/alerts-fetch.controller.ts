import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { IsString, MaxLength } from 'class-validator';
import { WebhookClientService } from '../webhooks/webhook-client.service.js';

/** The body of a fetch: the address to read from. */
export class FetchBody {
  @IsString()
  @MaxLength(2000)
  url: string;
}

/** Reads from a URL the caller names, and answers what came back. */
@Controller('internal/alerts')
export class AlertsFetchController {
  constructor(private readonly client: WebhookClientService) {}

  @Post('fetch')
  @HttpCode(200)
  async fetch(@UserId() _caller: string, @Body() body: FetchBody) {
    // SSRF-003 / CWE-918: the caller's URL is fetched with no outbound guard and the
    // answer is returned, so an internal endpoint can be read from inside the machine.
    const attempt = await this.client.read(body.url);
    if (!attempt.sent) {
      throw new BadRequestException(attempt.reason);
    }
    if ('error' in attempt) {
      throw new BadRequestException(attempt.error);
    }
    return { status: attempt.answer.status, body: attempt.answer.body };
  }
}
