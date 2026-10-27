import { defineConfig } from 'vitest/config';
import base from '../../vitest.config';
// Replace include instead of mergeConfig's array concatenation: benchmark is opt-in only.
export default defineConfig({ ...base, test: { ...base.test, include: ['scripts/benchmarks/equipment-update.bench.tsx'] } });
