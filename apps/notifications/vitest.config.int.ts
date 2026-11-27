import { workspaceConfig } from '../../vitest.libs.js';

// One service, alone, with its own store. Files run one at a time: they share
// the service's port, and starting a database engine is slow the first time.
export default workspaceConfig({
  include: ['test/**/*.int-spec.ts'],
  fileParallelism: false,
  testTimeout: 30_000,
  hookTimeout: 300_000,
});
