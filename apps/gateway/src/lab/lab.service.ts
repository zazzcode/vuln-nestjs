import { Injectable, Logger } from '@nestjs/common';
import type { ServiceName } from '@zazzles/exchange-config';
import { BACKENDS } from '../config/ports.js';
import { InternalClientService } from '../internal/internal-client.service.js';

/** What one backend service reports about itself. */
export interface ServiceHealth {
  status: string;
  service: string;
  store?: { engine: string; connected: boolean };
}

/** The state of the lab, one entry per backend service. */
export interface LabHealth {
  status: 'ok' | 'unavailable';
  services: Record<
    ServiceName,
    ServiceHealth | { status: 'unavailable'; service: string }
  >;
}

/** What a reset came to, one entry per backend service. */
export type ResetReport = Record<ServiceName, 'ok' | 'unavailable'>;

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(private readonly internal: InternalClientService) {}

  /** Every backend service and its store, each asked on its own port. One that does not answer is reported by name. */
  async health(): Promise<LabHealth> {
    const services = Object.fromEntries(
      await Promise.all(
        BACKENDS.map(async (service) => [
          service,
          await this.report(service, () => this.internal.health(service)),
        ]),
      ),
    ) as LabHealth['services'];
    // A service is up when it says so and its store is not reported as disconnected.
    const unavailable = Object.values(services).some(
      (health) => health.status !== 'ok' || health.store?.connected === false,
    );
    return { status: unavailable ? 'unavailable' : 'ok', services };
  }

  /** Asks every backend service to return its store to the fake data. Not atomic: each resets its own. */
  async reset(): Promise<ResetReport> {
    const entries = await Promise.all(
      BACKENDS.map(
        async (service) =>
          [
            service,
            (await this.report(service, () => this.internal.reset(service)))
              .status === 'ok'
              ? 'ok'
              : 'unavailable',
          ] as const,
      ),
    );
    return Object.fromEntries(entries) as ResetReport;
  }

  /** The service's own answer, or an entry that says it is unavailable. Never throws. */
  private async report(
    service: ServiceName,
    ask: () => Promise<unknown>,
  ): Promise<ServiceHealth | { status: 'unavailable'; service: string }> {
    try {
      const answer = (await ask()) as ServiceHealth;
      return {
        status: answer.status,
        service: answer.service,
        store: answer.store,
      };
    } catch (error) {
      this.logger.warn(
        `${service} is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'unavailable', service };
    }
  }
}
