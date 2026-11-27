import { ServiceUnavailableException } from '@nestjs/common';
import type { InternalClientService } from '../internal/internal-client.service.js';
import { LabService } from './lab.service.js';

const healthy = (service: string) => ({
  status: 'ok',
  service,
  store: { engine: 'an engine', connected: true },
});

/** A client that answers each service as told. */
const clientAnswering = (
  answer: (service: string) => Promise<unknown>,
): InternalClientService =>
  ({
    health: answer,
    reset: answer,
  }) as unknown as InternalClientService;

describe('LabService', () => {
  it('reports the lab as up when every backend service answers', async () => {
    const health = await new LabService(
      clientAnswering((service) => Promise.resolve(healthy(service))),
    ).health();

    expect(health).toEqual({
      status: 'ok',
      services: {
        accounts: healthy('accounts'),
        trading: healthy('trading'),
        notifications: healthy('notifications'),
      },
    });
  });

  it('reports a service that does not answer by name, and the others as they are', async () => {
    const health = await new LabService(
      clientAnswering((service) =>
        service === 'trading'
          ? Promise.reject(
              new ServiceUnavailableException('trading is unreachable'),
            )
          : Promise.resolve(healthy(service)),
      ),
    ).health();

    expect(health.status).toBe('unavailable');
    expect(health.services.trading).toEqual({
      status: 'unavailable',
      service: 'trading',
    });
    expect(health.services.accounts).toEqual(healthy('accounts'));
    expect(health.services.notifications).toEqual(healthy('notifications'));
  });

  it('answers reset with one status per service, and a service that failed by name', async () => {
    const lab = new LabService(
      clientAnswering((service) =>
        service === 'notifications'
          ? Promise.reject(new Error('refused'))
          : Promise.resolve(healthy(service)),
      ),
    );

    expect(await lab.reset()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'unavailable',
    });
  });
});
