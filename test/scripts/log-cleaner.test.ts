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
			`${JSON.stringify({ chunk: '\x1b[32mgreen\x1b[0m' })}\n`,
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

	test('redacts secrets alongside the ANSI strip', async () => {
		const token = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;
		const dirty = JSON.stringify({
			chunk: `\x1b[31mGITHUB_TOKEN=${token}\x1b[0m`,
			type: 'raw_log',
		});
		const iterationsDir = await setupIterations([{ name: '001.log', content: `${dirty}\n` }]);
		const result = await cleanIterationLogs(iterationsDir);
		expect(result.cleanedFiles).toBe(1);
		const cleaned = await readFile(join(iterationsDir, '001.log'), 'utf8');
		expect(cleaned).not.toContain(token);
		expect(cleaned).toContain('[REDACTED]');
	});

	// The gap that let the exposure persist: a directory already swept by the ANSI-only cleaner
	// carries a marker whose mtime is newer than every log in it, so a later pass that scanned on
	// mtime alone would skip exactly the files it was added to fix.
	test('re-sweeps a directory whose marker predates this cleaner version', async () => {
		const token = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;
		const iterationsDir = await setupIterations([
			{ name: '001.log', content: `${JSON.stringify({ chunk: `token=${token}` })}\n` },
		]);
		// What the previous cleaner left behind: an empty marker, stamped after the log.
		await writeFile(join(iterationsDir, '.cleaned'), '');

		const result = await cleanIterationLogs(iterationsDir);

		expect(result.scannedFiles).toBe(1);
		expect(await readFile(join(iterationsDir, '001.log'), 'utf8')).not.toContain(token);
		// And the refreshed marker claims the version that actually did the work, so the next run
		// goes back to skipping on mtime instead of re-reading every log forever.
		expect((await readFile(join(iterationsDir, '.cleaned'), 'utf8')).trim()).toBe('v2-secrets');
	});

	// A credential redacted from NNN.log used to survive intact in the NNN.json beside it.
	test('sweeps the structured sidecar and keeps it parseable', async () => {
		const token = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;
		const iterationsDir = await setupIterations([
			{
				name: '001.json',
				content: `${JSON.stringify({ commands: [`gh auth login --with-token ${token}`], iteration: 1 }, null, 2)}\n`,
			},
		]);

		const result = await cleanIterationLogs(iterationsDir);

		expect(result.cleanedFiles).toBe(1);
		const raw = await readFile(join(iterationsDir, '001.json'), 'utf8');
		expect(raw).not.toContain(token);
		const parsed = JSON.parse(raw) as { commands: string[]; iteration: number };
		expect(parsed.iteration).toBe(1);
		expect(parsed.commands[0]).toContain('gh auth login');
		expect(parsed.commands[0]).toContain('[REDACTED]');
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
