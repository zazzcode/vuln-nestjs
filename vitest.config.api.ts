import { workspaceConfig } from './vitest.libs.js';

// The Postman collections, each run under Newman against the lab. One lab for
// the file, on the lab's real ports, like the end-to-end suite.
export default workspaceConfig({
  include: ['tests/api/**/*.api-spec.ts'],
  fileParallelism: false,
  testTimeout: 120_000,
  hookTimeout: 300_000,
});
