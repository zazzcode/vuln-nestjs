import { BadRequestException, Injectable } from '@nestjs/common';
import { WebhookClientService } from '../webhooks/webhook-client.service.js';
import { AlertsService, type NewAlert } from './alerts.service.js';
import type { Alert } from './alert.model.js';

/** What one imported alert document holds, once it has been checked. */
interface AlertDocument {
  symbol: string;
  direction: 'ABOVE' | 'BELOW';
  threshold: string;
  label?: unknown;
}

/**
 * Imports alerts from content a caller brings, or from a URL a caller names
 * behind the outbound guard. The content is parsed here and nothing is
 * fetched for it.
 */
@Injectable()
export class AlertsImportService {
  constructor(
    private readonly alerts: AlertsService,
    private readonly client: WebhookClientService,
  ) {}

  /** Creates the caller's alerts from a JSON array of alert documents. */
  async fromContent(caller: string, json: string): Promise<Alert[]> {
    const documents = parseAlertDocuments(json);
    const created: Alert[] = [];
    for (const document of documents) {
      created.push(await this.alerts.create(caller, document));
    }
    return created;
  }

  /**
   * Fetches the URL through the guard and creates the caller's alerts from
   * what came back. A refusal by the guard is an error naming the rule, and
   * nothing is fetched.
   */
  async fromUrl(caller: string, url: string): Promise<Alert[]> {
    const attempt = await this.client.get(url);
    if (!attempt.sent) {
      throw new BadRequestException(attempt.reason);
    }
    if ('error' in attempt) {
      throw new BadRequestException(attempt.error);
    }
    if (attempt.answer.status < 200 || attempt.answer.status >= 300) {
      throw new BadRequestException(
        `the URL answered ${attempt.answer.status}, which is not a document`,
      );
    }
    return this.fromContent(caller, attempt.answer.body);
  }
}

/** Parses alert documents, refusing anything that is not one. */
function parseAlertDocuments(json: string): NewAlert[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('the value is not an alert document');
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('the value is not an alert document');
  }
  return parsed.map((document) => {
    if (!isAlertDocument(document)) {
      throw new BadRequestException('the value is not an alert document');
    }
    return {
      symbol: document.symbol,
      direction: document.direction,
      threshold: document.threshold,
      label: typeof document.label === 'string' ? document.label : null,
    } satisfies NewAlert;
  });
}

function isAlertDocument(value: unknown): value is AlertDocument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const document = value as AlertDocument;
  return (
    typeof document.symbol === 'string' &&
    typeof document.threshold === 'string' &&
    (document.direction === 'ABOVE' || document.direction === 'BELOW') &&
    (document.label === undefined || typeof document.label === 'string')
  );
}
