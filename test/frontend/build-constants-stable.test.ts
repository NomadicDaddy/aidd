import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND = resolve(process.cwd(), 'frontend');

describe('build constants are stable across rebuilds', () => {
	// A per-build value compiled into a chunk renames the entry and, through every chunk that
	// imports it by name, most of the bundle on each rebuild of identical source, which defeats
	// the immutable caching of /assets/. The timestamp belongs in index.html, served no-store.
	test('the Vite define block carries no Date-derived constant', async () => {
		const config = await readFile(resolve(FRONTEND, 'vite.config.ts'), 'utf8');
		const start = config.indexOf('\tdefine: {');
		const end = config.indexOf('\t},', start);
		expect(start).toBeGreaterThan(-1);
		const defineBlock = config.slice(start, end);
		expect(defineBlock).not.toContain('Date');
		expect(defineBlock).not.toContain('buildTimestamp');
		expect(defineBlock).not.toContain('__AIDD_BUILD_TIMESTAMP__');
	});

	test('the timestamp is injected into the entry document instead', async () => {
		const config = await readFile(resolve(FRONTEND, 'vite.config.ts'), 'utf8');
		expect(config).toContain("name: 'aidd-build-timestamp'");
		expect(config).toContain("injectTo: 'head'");
		const identity = await readFile(resolve(FRONTEND, 'src/lib/buildIdentity.ts'), 'utf8');
		expect(identity).toContain("BUILD_TIMESTAMP_META = 'aidd-build-timestamp'");
		expect(identity).not.toContain('__AIDD_BUILD_TIMESTAMP__');
	});
});
