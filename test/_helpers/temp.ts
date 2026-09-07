import { mkdirSync, mkdtempSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempRootFor } from '../../scripts/lib/test-temp-root.ts';

// Tests must create temp fixtures through these helpers, never via mkdtemp(tmpdir())
// directly: fixtures under testTempRoot are swept as one tree by the preload at the
// next suite start, so individual tests do not need their own rm() cleanup. The root is
// scoped to this checkout (bun test runs from the repo root), matching the run lock.
export const testTempRoot = testTempRootFor(process.cwd());

export async function testTempDir(prefix: string): Promise<string> {
	mkdirSync(testTempRoot, { recursive: true });
	return mkdtemp(join(testTempRoot, prefix));
}

export function testTempDirSync(prefix: string): string {
	mkdirSync(testTempRoot, { recursive: true });
	return mkdtempSync(join(testTempRoot, prefix));
}
