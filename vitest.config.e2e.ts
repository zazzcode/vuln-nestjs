import { workspaceConfig } from './vitest.libs.js';

// The whole lab, in the test process, on its real ports. Each file is one lab
// run, and the files run one at a time: they share those ports.
export default workspaceConfig({
  include: ['tests/e2e/**/*.e2e-spec.ts'],
  fileParallelism: false,
  testTimeout: 60_000,
  hookTimeout: 300_000,
});
