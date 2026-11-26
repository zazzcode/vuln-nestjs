import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const libraries = fileURLToPath(new URL('./libs/', import.meta.url));

// Resolves every `@zazzles/exchange-*` package to its TypeScript source, so a
// test never depends on a build and can never pass against a stale `dist/`.
const libraryAliases = (): Record<string, string> =>
  Object.fromEntries(
    readdirSync(libraries).map((name) => [
      `@zazzles/exchange-${name}`,
      path.join(libraries, name, 'src', 'index.ts'),
    ]),
  );

/** The Vitest configuration every workspace starts from. */
export function workspaceConfig(test: {
  include: string[];
  fileParallelism?: boolean;
  testTimeout?: number;
  hookTimeout?: number;
}) {
  return defineConfig({
    resolve: { alias: libraryAliases() },
    test: { globals: true, ...test },
  });
}
