import { describe, expect, test } from 'bun:test';

import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	BACKEND_LOG_FILES,
	MAX_LOG_ARCHIVE_AGE_MS,
	MAX_LOG_ARCHIVES,
	MAX_LOG_BYTES,
	rotateBackendLogs,
	rotateLogFile,
} from '../../scripts/lib/start-web/log-rotation.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const LIMIT = 64;

function write(dir: string, name: string, contents: string): void {
	writeFileSync(join(dir, name), contents);
}

async function withLogsDir(run: (dir: string) => Promise<void>): Promise<void> {
	const dir = await testTempDir('aidd-log-rotation-');
	try {
		await run(dir);
	} finally {
		await removeTempTree(dir);
	}
}

describe('detached backend log rotation', () => {
	test('bounds the active file at 10 MiB and keeps five archives', () => {
		expect(MAX_LOG_BYTES).toBe(10 * 1024 * 1024);
		expect(MAX_LOG_ARCHIVES).toBe(5);
		expect([...BACKEND_LOG_FILES]).toEqual(['backend.log', 'backend.error.log']);
	});

	test('skips a missing log file', async () => {
		await withLogsDir(async (dir) => {
			const result = rotateLogFile(dir, 'backend.log', LIMIT, 3);

			expect(result.outcome).toBe('skipped');
			expect(existsSync(join(dir, 'backend.log.1'))).toBe(false);
			await Promise.resolve();
		});
	});

	test('leaves a below-threshold file untouched', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'x'.repeat(LIMIT - 1));

			const result = rotateLogFile(dir, 'backend.log', LIMIT, 3);

			expect(result.outcome).toBe('skipped');
			expect(existsSync(join(dir, 'backend.log.1'))).toBe(false);
			expect(await readFile(join(dir, 'backend.log'), 'utf8')).toHaveLength(LIMIT - 1);
		});
	});

	test('removes archives older than the age bound even below the size threshold', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'small');
			write(dir, 'backend.log.1', 'expired');
			const old = new Date(Date.now() - MAX_LOG_ARCHIVE_AGE_MS - 1_000);
			utimesSync(join(dir, 'backend.log.1'), old, old);

			expect(rotateLogFile(dir, 'backend.log', LIMIT, 3).outcome).toBe('skipped');
			expect(existsSync(join(dir, 'backend.log.1'))).toBe(false);
		});
	});

	test('moves an at-threshold file to .1 without truncating its bytes', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'a'.repeat(LIMIT));

			const result = rotateLogFile(dir, 'backend.log', LIMIT, 3);

			expect(result.outcome).toBe('rotated');
			// Renamed, not truncated in place: nothing is left at the active path for the next
			// append-mode open to inherit.
			expect(existsSync(join(dir, 'backend.log'))).toBe(false);
			expect(await readFile(join(dir, 'backend.log.1'), 'utf8')).toBe('a'.repeat(LIMIT));
		});
	});

	test('shifts archives oldest-first and drops everything past the cap', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'new'.padEnd(LIMIT, '!'));
			write(dir, 'backend.log.1', 'one');
			write(dir, 'backend.log.2', 'two');
			write(dir, 'backend.log.3', 'three');

			const result = rotateLogFile(dir, 'backend.log', LIMIT, 3);

			expect(result.outcome).toBe('rotated');
			expect(await readFile(join(dir, 'backend.log.1'), 'utf8')).toBe(
				'new'.padEnd(LIMIT, '!'),
			);
			expect(await readFile(join(dir, 'backend.log.2'), 'utf8')).toBe('one');
			expect(await readFile(join(dir, 'backend.log.3'), 'utf8')).toBe('two');
			// "three" was the oldest kept archive and falls off the end.
			expect(existsSync(join(dir, 'backend.log.4'))).toBe(false);
		});
	});

	test('shifts a partial archive sequence without losing an archive', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'new'.padEnd(LIMIT, '!'));
			write(dir, 'backend.log.3', 'three');

			expect(rotateLogFile(dir, 'backend.log', LIMIT, 5).outcome).toBe('rotated');

			expect(await readFile(join(dir, 'backend.log.1'), 'utf8')).toBe(
				'new'.padEnd(LIMIT, '!'),
			);
			expect(existsSync(join(dir, 'backend.log.2'))).toBe(false);
			expect(existsSync(join(dir, 'backend.log.3'))).toBe(false);
			expect(await readFile(join(dir, 'backend.log.4'), 'utf8')).toBe('three');
		});
	});

	test('leaves the active log intact when a rotation step fails', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'a'.repeat(LIMIT));
			// Stands in for the Windows case where another handle blocks the rename: any failure
			// inside the sequence must abort rotation rather than truncate the live log.
			mkdirSync(join(dir, 'backend.log.3'));
			write(dir, join('backend.log.3', 'held'), 'x');

			const result = rotateLogFile(dir, 'backend.log', LIMIT, 3);

			expect(result.outcome).toBe('failed');
			expect(result.reason).not.toBe('');
			expect(await readFile(join(dir, 'backend.log'), 'utf8')).toBe('a'.repeat(LIMIT));
		});
	});

	test('rotates stdout and stderr independently', async () => {
		await withLogsDir(async (dir) => {
			write(dir, 'backend.log', 'a'.repeat(MAX_LOG_BYTES));
			write(dir, 'backend.error.log', 'small');

			const results = rotateBackendLogs(dir);

			expect(results.map((entry) => entry.outcome)).toEqual(['rotated', 'skipped']);
			expect(statSync(join(dir, 'backend.log.1')).size).toBe(MAX_LOG_BYTES);
			expect(existsSync(join(dir, 'backend.error.log.1'))).toBe(false);
			expect(await readFile(join(dir, 'backend.error.log'), 'utf8')).toBe('small');
		});
	});
});

describe('start-web rotation wiring', () => {
	test('rotates before the detached descriptors are opened', async () => {
		const source = await readFile(
			join(import.meta.dir, '..', '..', 'scripts', 'start-web.ts'),
			'utf8',
		);

		const rotateAt = source.indexOf('rotateBackendLogs(logsDir)');
		const openAt = source.indexOf("openLogFd('backend.log')");

		expect(rotateAt).toBeGreaterThan(-1);
		expect(openAt).toBeGreaterThan(rotateAt);
		// The foreground path inherits the terminal's stdio and must not be rotated into.
		expect(source).toContain("stdout: 'inherit' as const");
	});
});
