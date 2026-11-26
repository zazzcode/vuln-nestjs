import { workspaceConfig } from './vitest.libs.js';

// The root's own unit tests: the scripts beside them, and the repository-wide checks.
// Each workspace runs its own under its own configuration.
export default workspaceConfig({
  include: ['scripts/**/*.spec.ts', 'tests/**/*.spec.ts'],
});
