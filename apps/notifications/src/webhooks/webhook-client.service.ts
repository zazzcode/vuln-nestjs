import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import fetch from 'node-fetch';
import { Environment } from '../config/environment.js';
import { OutboundGuardService } from './outbound-guard.service.js';
import {
  SIGNATURE_HEADER,
  deriveSignatureKey,
  signatureFor,
} from './webhook-signature.js';
import type { DeliveryEntity } from './delivery.entity.js';

/** One answer from a receiver: its status and its body, nothing else. */
export interface Answer {
  status: number;
  body: string;
}

/** How one delivery attempt ended, whichever way it was made. */
export type DeliveryOutcome =
  | { sent: false; reason: string }
  | { sent: true; answer: Answer }
  | { sent: true; error: string };

/** The part of a delivery record that says what happened. */
export type OutcomeFields = Pick<
  DeliveryEntity,
  'status' | 'lastError' | 'responseBody' | 'deliveredAt'
>;

/** Five seconds: no delivery waits longer. */
const TIMEOUT_MS = 5_000;

/**
 * The client every webhook delivery goes through. The signed POST is made
 * with `node-fetch` over HTTP/1.1, with `X-VCX-Signature` over the raw body.
 */
@Injectable()
export class WebhookClientService implements OnApplicationShutdown {
  private readonly key: Buffer;

  constructor(
    private readonly environment: Environment,
    private readonly guard: OutboundGuardService,
  ) {
    this.key = deriveSignatureKey(environment.JWT_SECRET);
  }

  /** Nothing to clean up: the client holds no connection pool of its own. */
  async onApplicationShutdown(): Promise<void> {}

  /**
   * One POST through the outbound guard. Resolves with what was answered;
   * never throws for a refusal or a failure. A redirect is not followed.
   */
  async post(url: string, payload: unknown): Promise<DeliveryOutcome> {
    const decision = await this.guard.check(url);
    if (!decision.allowed) {
      return { sent: false, reason: decision.reason };
    }
    return this.deliver(url, payload, 'manual');
  }

  /**
   * One POST to whatever the URL says, with no guard, following the
   * redirects the receiver offers. The delivery record is the caller's to
   * make.
   */
  async send(url: string, payload: unknown): Promise<DeliveryOutcome> {
    return this.deliver(url, payload, 'follow');
  }

  /**
   * One GET through the outbound guard, for a caller that reads from a URL.
   * Never follows a redirect; gives up after the same five seconds.
   */
  async get(url: string): Promise<DeliveryOutcome> {
    const decision = await this.guard.check(url);
    if (!decision.allowed) {
      return { sent: false, reason: decision.reason };
    }
    try {
      const answer = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        timeout: TIMEOUT_MS,
      });
      const text = await answer.text();
      if (answer.status >= 300 && answer.status < 400) {
        return {
          sent: true,
          error: `refused: the receiver answered ${answer.status}, a redirect the client does not follow`,
        };
      }
      return { sent: true, answer: { status: answer.status, body: text } };
    } catch (error) {
      return {
        sent: true,
        error: `the request could not be made: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async deliver(
    url: string,
    payload: unknown,
    redirect: 'manual' | 'follow',
  ): Promise<DeliveryOutcome> {
    const body = JSON.stringify(payload);
    try {
      const answer = await fetch(url, {
        method: 'POST',
        redirect,
        timeout: TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          [SIGNATURE_HEADER]: signatureFor(body, this.key),
        },
        body,
      });
      const text = await answer.text();
      if (answer.status >= 300 && answer.status < 400) {
        return {
          sent: true,
          error: `refused: the receiver answered ${answer.status}, a redirect the client does not follow`,
        };
      }
      return { sent: true, answer: { status: answer.status, body: text } };
    } catch (error) {
      return {
        sent: true,
        error: `the request could not be delivered: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** How a delivery ended, whichever way it was made. */
  static outcomeOf(attempt: DeliveryOutcome): OutcomeFields {
    if (!attempt.sent) {
      return {
        status: 'FAILED',
        lastError: attempt.reason,
        responseBody: null,
        deliveredAt: null,
      };
    }
    if ('error' in attempt) {
      return {
        status: 'FAILED',
        lastError: attempt.error,
        responseBody: null,
        deliveredAt: null,
      };
    }
    if (attempt.answer.status >= 200 && attempt.answer.status < 300) {
      return {
        status: 'DELIVERED',
        lastError: null,
        responseBody: attempt.answer.body,
        deliveredAt: new Date(),
      };
    }
    return {
      status: 'FAILED',
      lastError: `the receiver answered ${attempt.answer.status}`,
      responseBody: attempt.answer.body,
      deliveredAt: null,
    };
  }
}
