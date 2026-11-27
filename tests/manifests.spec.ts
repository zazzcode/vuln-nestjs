import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

interface Manifest {
  name: string;
  type?: string;
  packageManager?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** The workspaces in a group of the repository: the directories under it that have a manifest. */
const workspacesIn = (group: string): string[] =>
  readdirSync(path.join(root, group)).filter((name) =>
    existsSync(path.join(root, group, name, 'package.json')),
  );

/** The root and every workspace. */
const manifests: [directory: string, manifest: Manifest][] = [
  '.',
  ...workspacesIn('apps').map((name) => `apps/${name}`),
  ...workspacesIn('libs').map((name) => `libs/${name}`),
].map((directory) => [
  directory,
  JSON.parse(
    readFileSync(path.join(root, directory, 'package.json'), 'utf8'),
  ) as Manifest,
]);

/** Every dependency a manifest declares, whatever it is called there. */
function declared(manifest: Manifest): [name: string, version: string][] {
  return Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  });
}

const rootManifest = manifests[0][1];
const services = ['accounts', 'trading', 'notifications', 'gateway'];

describe('the manifests', () => {
  test('finds the root and the ten workspaces', () => {
    expect(manifests.map(([directory]) => directory)).toEqual([
      '.',
      'apps/accounts',
      'apps/gateway',
      'apps/notifications',
      'apps/trading',
      'libs/config',
      'libs/graphql',
      'libs/http2',
      'libs/internal-auth',
      'libs/lab-data',
      'libs/testing',
    ]);
  });

  // A scanner is shown an exact version; a range would let one machine run another package than the next.
  test('pin every dependency to an exact version, or to a workspace', () => {
    for (const [directory, manifest] of manifests) {
      for (const [name, version] of declared(manifest)) {
        expect({ directory, name, version }).toEqual({
          directory,
          name,
          version: expect.stringMatching(
            /^\d+\.\d+\.\d+$|^workspace:/,
          ) as unknown as string,
        });
      }
    }
  });

  test('run on the Node and pnpm the plan names, as ES modules', () => {
    expect(rootManifest.packageManager).toBe('pnpm@12.23.0');
    expect(rootManifest.engines?.node).toBe('>=24.11.0');
    for (const [, manifest] of manifests) {
      expect(manifest.type).toBe('module');
    }
  });
});

describe('what the lab must not contain', () => {
  // @nestjs/observe reports to Nest; @nestjs/mau deploys to a cloud. The lab sends no telemetry and is never deployed.
  test('no telemetry or deployment package, anywhere', () => {
    const forbidden = ['@nestjs/observe', '@nestjs/mau'];

    for (const [, manifest] of manifests) {
      for (const [name] of declared(manifest)) {
        expect(forbidden).not.toContain(name);
      }
    }
  });

  test("no workspace runs a dependency's install script", () => {
    const workspace = readFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'utf8',
    );
    // What is decided in the allowBuilds block: each line of it names a package and says false or true.
    const lines = workspace.split('\n');
    const first = lines.findIndex((line) => line.startsWith('allowBuilds:'));
    const block: string[] = [];
    for (const line of lines.slice(first + 1)) {
      // The block ends at the next key, which starts at the margin.
      if (!/^\s/.test(line)) {
        break;
      }
      if (line.trim() !== '' && !line.trim().startsWith('#')) {
        block.push(line.trim());
      }
    }
    const decided = Object.fromEntries(
      block.map((line) => {
        const [name, decision] = line.replace(/^"|"$/g, '').split(/:\s+/);
        return [name, decision];
      }),
    );

    expect(first).toBeGreaterThan(-1);
    expect(decided).toEqual(
      Object.fromEntries(Object.keys(decided).map((name) => [name, 'false'])),
    );
    // The package whose install script downloads the MongoDB binary, among them.
    expect(Object.keys(decided)).toContain('mongodb-memory-server');
    // Nest's core names the Express adapter as a required peer. Installing it silently would put Express into
    // the three Fastify services, and the lab attributes a dependency finding to one service.
    expect(workspace).toMatch(/^autoInstallPeers: false$/m);
  });
});

describe('the structure the architecture depends on', () => {
  const dependingOn = (name: string): string[] =>
    manifests
      .filter(([, manifest]) =>
        declared(manifest).some(([dependency]) => dependency === name),
      )
      .map(([directory]) => directory);

  // ADR-011: accounts reaches MongoDB through the native driver.
  test('only trading and notifications use an object-relational mapper', () => {
    for (const mapper of ['typeorm', '@nestjs/typeorm']) {
      expect(dependingOn(mapper)).toEqual([
        'apps/notifications',
        'apps/trading',
      ]);
    }
  });

  // ADR-006: one service on the Express adapter, so that both adapters are covered.
  test('one service uses the Express adapter, three the Fastify one', () => {
    expect(dependingOn('@nestjs/platform-express')).toEqual([
      'apps/notifications',
    ]);
    expect(dependingOn('@nestjs/platform-fastify')).toEqual([
      'apps/accounts',
      'apps/gateway',
      'apps/trading',
    ]);
  });

  // ADR-010: services never call each other. Only the gateway holds a client for another service.
  test('no service depends on another service, and only the gateway holds the client for one', () => {
    for (const service of services) {
      for (const other of services) {
        if (service === other) {
          continue;
        }
        expect(dependingOn(`@zazzles/exchange-${other}`)).not.toContain(
          `apps/${service}`,
        );
      }
    }
    expect(dependingOn('@zazzles/exchange-http2')).toEqual(['apps/gateway']);
  });

  // Every service authenticates by itself and starts with the same environment.
  test('every service authenticates, configures itself and stops on a signal through the shared libraries', () => {
    for (const service of services) {
      expect(dependingOn('@zazzles/exchange-internal-auth')).toContain(
        `apps/${service}`,
      );
      expect(dependingOn('@zazzles/exchange-config')).toContain(
        `apps/${service}`,
      );
    }
  });
});
