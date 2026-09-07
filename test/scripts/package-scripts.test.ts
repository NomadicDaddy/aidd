import { describe, expect, test } from 'bun:test';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import packageJson from '../../package.json';
import { lintTasks } from '../../scripts/run-lint.ts';

const scripts = packageJson.scripts;

function repoFile(...segments: string[]): Promise<string> {
	return readFile(join(process.cwd(), ...segments), 'utf8');
}

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

	test('exposes the full gate as a first-class script', () => {
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
			'bunx eslint test --report-unused-disable-directives --max-warnings 0',
		);
		expect(scripts['lint:test:fast']).toBe(
			'bunx eslint test --cache --cache-location node_modules/.cache/eslint-test/ --report-unused-disable-directives --max-warnings 0',
		);
		expect(lintTasks(false).map((task) => task.name)).toContain('test');
		expect(lintTasks(true).map((task) => task.command.at(-1))).toContain('lint:test:fast');
	});

	test('lints the root ESLint config through every lint lifecycle', () => {
		expect(scripts['lint:config']).toBe(
			'bunx eslint eslint.config.js --report-unused-disable-directives --max-warnings 0',
		);
		expect(scripts['lint:config:fast']).toBe(
			'bunx eslint eslint.config.js --cache --cache-location node_modules/.cache/eslint-config/ --report-unused-disable-directives --max-warnings 0',
		);
		expect(scripts['lint:config:fix']).toBe(
			'bunx eslint eslint.config.js --report-unused-disable-directives --max-warnings 0 --fix',
		);
		expect(lintTasks(false).map((task) => task.name)).toContain('config');
		expect(lintTasks(true).map((task) => task.command.at(-1))).toContain('lint:config:fast');
		expect(scripts['lint:fix']).toContain('bun run lint:config:fix');
	});

	test('runs all seven lint scopes through the bounded runner', () => {
		expect(scripts.lint).toBe('bun scripts/run-lint.ts');
		expect(scripts['lint:fast']).toBe('bun scripts/run-lint.ts --fast');
		expect(lintTasks(false).map((task) => task.name)).toEqual([
			'shared',
			'backend',
			'frontend',
			'scripts',
			'cli',
			'test',
			'config',
		]);
		expect(lintTasks(true)).toHaveLength(7);
	});

	test('keeps --cache out of the authoritative lint gate', () => {
		// ESLint's --cache keys on each file's own content, which the type-aware rules outlive: a
		// type change in one file can create a violation in another the cache treats as unchanged
		// and skips. The fast gate takes that trade for speed; `lint` is what has to be right.
		for (const [name, command] of Object.entries(scripts)) {
			if (!name.startsWith('lint') || name.endsWith(':fast')) continue;
			expect([name, command.includes('--cache')]).toEqual([name, false]);
		}
	});

	test('keeps unused exports and types blocking, including script entry points', async () => {
		const config = Bun.JSONC.parse(
			await Bun.file(new URL('../../knip.jsonc', import.meta.url)).text(),
		) as {
			includeEntryExports?: boolean;
			rules?: Record<string, string>;
		};

		expect(config.rules?.exports).toBe('error');
		expect(config.rules?.types).toBe('error');
		// Knip exempts entry-file exports by default; this pins the opt-in, not runtime behavior.
		expect(config.includeEntryExports).toBe(true);
	});

	test('reaches shell scripts through the bash resolver rather than PATH', () => {
		// C:\Windows\System32\bash.exe is the WSL launcher, and it shadows Git's bash for every
		// process whose PATH does not prepend Git's usr/bin. A bare `bash` therefore passes from
		// Git Bash and fails from PowerShell on the same machine, which broke `bun install` (the
		// prepare script) and smoke:qc with an execvpe(/bin/bash) relay error that named neither
		// the script nor the shell it wanted. Shell scripts are invoked through
		// scripts/run-bash.ts, which resolves Git's own bash.
		const bareBash = Object.entries(scripts).filter(([, command]) =>
			/(?:^|\s|\()bash\s/.test(command),
		);

		expect(bareBash).toEqual([]);
		expect(scripts['check:leak-guard']).toContain('scripts/run-bash.ts');
		expect(scripts.prepare).toContain('scripts/run-bash.ts');
	});

	test('builds the control panel through the install lifecycle', async () => {
		// The release artifact is a source archive with no frontend/dist, and the documented path
		// is install then start. The install lifecycle is the only step between the two.
		expect(scripts.postinstall).toBe('bun scripts/postinstall.ts');

		const postinstall = await repoFile('scripts', 'postinstall.ts');
		expect(postinstall).toContain("'bun', 'run', 'build:frontend'");
		expect(postinstall).toContain('AIDD_SKIP_POSTINSTALL_BUILD');
	});

	test('keeps the built frontend untracked and out of every start path', async () => {
		const gitignore = await repoFile('.gitignore');
		expect(gitignore.split(/\r?\n/)).toContain('frontend/dist/');

		// One build path only. A start command that also built would race the lifecycle step and
		// make an unbuilt panel look like a start-time problem instead of an install-time one.
		for (const name of ['start', 'start:web', 'stop', 'stop:web'] as const) {
			expect([name, scripts[name].includes('build')]).toEqual([name, false]);
		}
	});

	test('exposes the source-release entrypoints and nothing that packages a binary', () => {
		expect(scripts['check:version-parity']).toBe('bun scripts/release-notes.ts --check');
		expect(scripts['release:notes']).toBe('bun scripts/release-notes.ts');
		expect(
			Object.keys(scripts).filter((name) =>
				/^(?:release:(?:check|package)|check:standalone|build:standalone|docker:|deploy:docker|smoke:docker|licenses:image|check:image-licenses|check:release-notices)/.test(
					name,
				),
			),
		).toEqual([]);
	});
});
