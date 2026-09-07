import { describe, expect, test } from 'bun:test';

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	decidePostinstall,
	findMissingDistAssets,
	runPostinstall,
	SKIP_BUILD_ENV,
} from '../../scripts/postinstall.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const INDEX_HTML = [
	'<!doctype html>',
	'<link rel="modulepreload" crossorigin href="/assets/vendor-1111.js">',
	'<script type="module" crossorigin src="/assets/index-0000.js"></script>',
	'<link rel="stylesheet" crossorigin href="/assets/index-0000.css">',
	'<link rel="icon" href="/favicon.svg">',
	'<a href="https://example.invalid/docs">docs</a>',
].join('\n');

function write(root: string, relativePath: string, contents: string): void {
	const target = join(root, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, contents);
}

/** A tracked-source checkout: a frontend workspace with sources and no `frontend/dist`. */
function writeSourceCheckout(root: string): void {
	write(root, 'package.json', JSON.stringify({ name: 'aidd', private: true }));
	write(root, 'frontend/package.json', JSON.stringify({ name: 'aidd-frontend' }));
	write(root, 'frontend/index.html', '<!doctype html>');
	write(root, 'frontend/vite.config.ts', 'export default {};');
	write(root, 'frontend/src/App.tsx', 'export const App = () => null;');
}

/** Stands in for `bun run build:frontend`, writing what a real Vite build emits. */
function writeBuildOutput(root: string): void {
	write(root, 'frontend/dist/index.html', INDEX_HTML);
	write(root, 'frontend/dist/assets/index-0000.js', 'console.log(1);');
	write(root, 'frontend/dist/assets/index-0000.css', 'body{}');
	write(root, 'frontend/dist/assets/vendor-1111.js', 'console.log(2);');
	write(root, 'frontend/dist/favicon.svg', '<svg/>');
	// Stamp the build after its inputs so the currency check does not immediately rebuild.
	const later = new Date(Date.now() + 60_000);
	utimesSync(join(root, 'frontend/dist/index.html'), later, later);
}

async function withCheckout(run: (root: string) => Promise<void>): Promise<void> {
	const root = await testTempDir('aidd-source-install-');
	try {
		await run(root);
	} finally {
		await removeTempTree(root);
	}
}

describe('source install lifecycle', () => {
	test('builds the control panel for a checkout that has no frontend/dist', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);
			let builds = 0;

			const code = runPostinstall(root, {
				env: {},
				runBuild: (target) => {
					builds += 1;
					writeBuildOutput(target);
					return { message: 'built', ok: true };
				},
			});

			expect(code).toBe(0);
			expect(builds).toBe(1);
			// Every entry and preload the emitted index references resolves on disk.
			expect(findMissingDistAssets(join(root, 'frontend', 'dist'))).toEqual([]);
			expect(await readFile(join(root, 'frontend/dist/index.html'), 'utf8')).toContain(
				'/assets/index-0000.js',
			);
		});
	});

	test('is idempotent: a second install over a current build does not rebuild', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);
			writeBuildOutput(root);
			let builds = 0;

			const code = runPostinstall(root, {
				env: {},
				runBuild: () => {
					builds += 1;
					return { message: 'built', ok: true };
				},
			});

			expect(code).toBe(0);
			expect(builds).toBe(0);
			await Promise.resolve();
		});
	});

	test('rebuilds when a source file is newer than the build', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);
			writeBuildOutput(root);
			const later = new Date(Date.now() + 120_000);
			utimesSync(join(root, 'frontend/src/App.tsx'), later, later);

			expect(decidePostinstall(root, {}).skip).toBe(false);
			await Promise.resolve();
		});
	});

	test('skips cleanly when the tree has no frontend workspace', async () => {
		await withCheckout(async (root) => {
			write(root, 'package.json', JSON.stringify({ name: 'aidd' }));
			let builds = 0;

			const code = runPostinstall(root, {
				env: {},
				runBuild: () => {
					builds += 1;
					return { message: 'built', ok: true };
				},
			});

			expect(code).toBe(0);
			expect(builds).toBe(0);
			await Promise.resolve();
		});
	});

	test('honours the opt-out used by CI and the release workflow', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);
			let builds = 0;

			const code = runPostinstall(root, {
				env: { [SKIP_BUILD_ENV]: '1' },
				runBuild: () => {
					builds += 1;
					return { message: 'built', ok: true };
				},
			});

			expect(code).toBe(0);
			expect(builds).toBe(0);
			await Promise.resolve();
		});
	});

	test('fails the install when the build fails', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);

			const code = runPostinstall(root, {
				env: {},
				runBuild: () => ({ message: 'build:frontend exited 1', ok: false }),
			});

			expect(code).toBe(1);
			await Promise.resolve();
		});
	});

	test('fails when a build claims success but leaves a referenced asset behind', async () => {
		await withCheckout(async (root) => {
			writeSourceCheckout(root);

			const code = runPostinstall(root, {
				env: {},
				runBuild: (target) => {
					write(target, 'frontend/dist/index.html', INDEX_HTML);
					return { message: 'built', ok: true };
				},
			});

			expect(code).toBe(1);
			expect(findMissingDistAssets(join(root, 'frontend', 'dist'))).toEqual([
				'assets/vendor-1111.js',
				'assets/index-0000.js',
				'assets/index-0000.css',
				'favicon.svg',
			]);
		});
	});

	test('reports a missing index.html rather than an empty asset list', async () => {
		await withCheckout(async (root) => {
			expect(findMissingDistAssets(join(root, 'frontend', 'dist'))).toEqual(['index.html']);
			await Promise.resolve();
		});
	});

	// This file stubs the builder, so it proves the decision logic and nothing about a real
	// install. The release workflow runs `check:source-install`, which exports the tag and installs
	// it for real; this asserts only that the gate still runs before the release is published.
	test('the release workflow installs the source archive before it creates the release', async () => {
		const workflow = await readFile(
			join(process.cwd(), '.github', 'workflows', 'release.yml'),
			'utf8',
		);

		const gateIndex = workflow.indexOf('bun run check:source-install');
		const createIndex = workflow.indexOf('gh release create');

		expect(gateIndex).toBeGreaterThan(-1);
		expect(createIndex).toBeGreaterThan(gateIndex);
	});
});
