import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanIterationLogs, stripAnsi } from '../../cli/src/metadata/log-cleaner.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function setupIterations(files: { name: string; content: string }[]): Promise<string> {
	const projectDir = await testTempDir('aidd-clean-');
	const iterationsDir = join(projectDir, '.aidd', 'iterations');
	await mkdir(iterationsDir, { recursive: true });
	for (const file of files) {
		await writeFile(join(iterationsDir, file.name), file.content);
	}
	return iterationsDir;
}

describe('stripAnsi', () => {
	test('removes color codes', () => {
		expect(stripAnsi('\x1b[31mERROR\x1b[0m foo')).toBe('ERROR foo');
	});

	test('removes bell and cursor controls', () => {
		expect(stripAnsi('hello\x07world')).toBe('helloworld');
	});

	test('passes through clean text', () => {
		expect(stripAnsi('plain text')).toBe('plain text');
	});
});

describe('cleanIterationLogs', () => {
	test('strips ANSI codes from raw_log JSONL chunks', async () => {
		const dirty = JSON.stringify({
			type: 'raw_log',
			stream: 'stdout',
			chunk: '\x1b[31mERROR\x1b[0m something failed',
		});
		const iterationsDir = await setupIterations([{ name: '001.log', content: `${dirty}\n` }]);
		const result = await cleanIterationLogs(iterationsDir);
		expect(result.cleanedFiles).toBe(1);
		const cleaned = await readFile(join(iterationsDir, '001.log'), 'utf8');
		expect(cleaned).toContain('ERROR something failed');
		expect(cleaned).not.toContain('\x1b');
	});

	test('preserves valid JSON structure for already-clean lines', async () => {
		const clean = JSON.stringify({ type: 'assistant_text', chunk: 'hello world' });
		const iterationsDir = await setupIterations([{ name: '001.log', content: `${clean}\n` }]);
		await cleanIterationLogs(iterationsDir);
		const after = (await readFile(join(iterationsDir, '001.log'), 'utf8')).trim();
		expect(JSON.parse(after)).toEqual({ type: 'assistant_text', chunk: 'hello world' });
	});

	test('writes .cleaned marker after scan', async () => {
		const iterationsDir = await setupIterations([
			{ name: '001.log', content: `${JSON.stringify({ chunk: 'x' })}\n` },
		]);
		await cleanIterationLogs(iterationsDir);
		const stats = await stat(join(iterationsDir, '.cleaned'));
		expect(stats.isFile()).toBe(true);
	});

	test('skips files older than .cleaned marker', async () => {
		const iterationsDir = await setupIterations([
			{
				name: '001.log',
				content: `${JSON.stringify({ chunk: '\x1b[31mred\x1b[0m' })}\n`,
			},
		]);
		await cleanIterationLogs(iterationsDir);
		const firstPass = await readFile(join(iterationsDir, '001.log'), 'utf8');
		await writeFile(
			join(iterationsDir, '001.log'),
			`${JSON.stringify({ chunk: '\x1b[32mgreen\x1b[0m' })}\n`
		);
		const oldTime = new Date(Date.now() - 60_000);
		const { utimes } = await import('node:fs/promises');
		await utimes(join(iterationsDir, '001.log'), oldTime, oldTime);
		const result = await cleanIterationLogs(iterationsDir);
		expect(result.scannedFiles).toBe(0);
		const after = await readFile(join(iterationsDir, '001.log'), 'utf8');
		expect(after).toContain('\\u001b[32mgreen');
		void firstPass;
	});

	test('returns zero counts for empty / missing dirs', async () => {
		const projectDir = await testTempDir('aidd-clean-empty-');
		const result = await cleanIterationLogs(join(projectDir, '.aidd', 'iterations'));
		expect(result).toEqual({ scannedFiles: 0, cleanedFiles: 0 });
	});

	test('falls back to plain ANSI strip for non-JSON lines', async () => {
		const iterationsDir = await setupIterations([
			{ name: '001.log', content: '\x1b[33mwarn\x1b[0m bare text\n' },
		]);
		const result = await cleanIterationLogs(iterationsDir);
		expect(result.cleanedFiles).toBe(1);
		const after = await readFile(join(iterationsDir, '001.log'), 'utf8');
		expect(after.trim()).toBe('warn bare text');
	});
});
