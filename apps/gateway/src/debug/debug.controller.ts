import { Controller, Get } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The versions of the packages this edge runs on. */
function dependencyVersions(): Record<string, string> {
  const of = (name: string) =>
    require(`${name}/package.json`) as { version: string };
  const names = [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-fastify',
    '@apollo/gateway',
    '@apollo/server',
    'fastify',
    'graphql',
  ];
  return Object.fromEntries(
    names.map((name) => {
      try {
        return [name, of(name).version];
      } catch {
        return [name, 'not installed'];
      }
    }),
  );
}

/**
 * The debug page of the lab: everything a person debugging a running sample
 * wants on one page. It is open, and it answers the whole environment of the
 * process, secret values included.
 */
@Controller('api/v1')
export class DebugController {
  /** CONFIG-004 / CWE-215: environment values and dependency versions, to anyone. */
  @Public()
  @Get('debug')
  debug() {
    return {
      service: 'gateway',
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      environment: { ...process.env },
      versions: { ...process.versions },
      dependencies: dependencyVersions(),
    };
  }
}
