import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', path), 'utf8');

/**
 * The navbar's active-run count and the Dashboard read one run-list query. When the count ran its
 * own listRuns under a key of its own, every page load requested the run list twice.
 */
test('the active-run badge reads the shared run-list query, not a second request', () => {
	const source = read('hooks/useActiveRunCount.ts');
	expect(source).toContain('useRunsList()');
	// Not the mutation module: the badge is in the app shell, so what it imports is critical path.
	expect(source).not.toContain("from './useRuns.ts'");
	expect(source).not.toMatch(/import[^;]*listRuns/);
	expect(source).not.toContain('useQuery');
	expect(source).not.toMatch(/queryKey:/);
});
