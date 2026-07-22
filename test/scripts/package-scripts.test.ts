import { describe, expect, test } from 'bun:test';

import packageJson from '../../package.json';

const scripts = packageJson.scripts;

describe('package script lifecycle contracts', () => {
	test('keeps stop scoped to the web control panel', () => {
		expect(scripts.stop).toBe('bun run stop:web');
		expect(scripts['stop:web']).toBe('bun scripts/stop-web.ts');
	});

	test('start:web spawns backend detached', () => {
		expect(scripts['start:web']).toBe('bun scripts/start-web.ts');
		expect('start:bridged' in scripts).toBe(false);
		expect(scripts['dev:web']).toBe('bun run stop:web && bun run dev:backend');
		expect(scripts['dev:backend']).toBe('bun run --cwd backend dev');
	});

	test('leaves root start as CLI orchestration', () => {
		expect(scripts.start).toBe('bun run --cwd cli start');
		expect(scripts.start).not.toContain('stop:web');
	});

	test('exposes standalone distribution checker outside smoke:qc', () => {
		expect(scripts['check:standalone']).toBe('bun scripts/check-standalone.ts');
		expect(scripts['smoke:qc']).toBe('bun scripts/smoke-qc.ts');
	});

	test('exposes the fast inner-loop gate as a first-class script', () => {
		expect(scripts['smoke:qc:fast']).toBe('bun scripts/smoke-qc.ts --fast');
	});

	test('exposes workspace build and validation entrypoints', () => {
		expect(scripts).toMatchObject({
			'build:backend': 'bun run --cwd backend build',
			'build:cli': 'bun run --cwd cli build',
			'build:frontend': 'bun run --cwd frontend build',
			'build:shared': 'bun run --cwd shared build',
			'check:dead-code': 'bunx knip',
			'check-application': 'bun scripts/check-application.ts',
			'test:coverage': 'bun scripts/run-test-coverage.ts',
		});
		expect(scripts.typecheck).toContain('tsc --noEmit');
		expect(scripts.typecheck).toContain('bun run --cwd frontend typecheck');
	});

	test('includes the Bun test corpus in the root lint gate', () => {
		expect(scripts['lint:test']).toBe(
			'bunx eslint test --cache --cache-location node_modules/.cache/eslint-test/ --report-unused-disable-directives --max-warnings 0'
		);
		expect(scripts.lint).toContain('bun run lint:test');
	});

	test('keeps unused exports and types blocking, including script entry points', async () => {
		const config = Bun.JSONC.parse(
			await Bun.file(new URL('../../knip.jsonc', import.meta.url)).text()
		) as {
			includeEntryExports?: boolean;
			rules?: Record<string, string>;
		};

		expect(config.rules?.exports).toBe('error');
		expect(config.rules?.types).toBe('error');
		// Knip exempts entry-file exports by default; this pins the opt-in, not runtime behavior.
		expect(config.includeEntryExports).toBe(true);
	});

	test('exposes release packaging entrypoints', () => {
		expect(scripts['release:check']).toBe('bun scripts/release-check.ts');
		expect(scripts['release:package']).toBe('bun scripts/package-release.ts');
	});
});
