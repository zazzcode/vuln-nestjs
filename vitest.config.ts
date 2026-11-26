import { workspaceConfig } from './vitest.libs.js';

// The root's own unit tests: the scripts beside them, and the repository-wide checks.
export default workspaceConfig(['scripts/**/*.spec.ts', 'tests/**/*.spec.ts']);
