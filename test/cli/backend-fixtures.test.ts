import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from 'aidd-shared/backends/types';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';
import { parseCodexBackendOutput } from 'aidd-shared/backends/parsers/codex';
import { parseGrokBackendOutput } from 'aidd-shared/backends/parsers/grok';
import type { BackendName } from 'aidd-shared/plan/types';

const fixturesRoot = join(import.meta.dir, '..', 'fixtures', 'backends');

const parsers: Record<BackendName, typeof parsePlainBackendOutput> = {
	'claude-code': parsePlainBackendOutput,
	codex: parseCodexBackendOutput,
	grok: parseGrokBackendOutput,
	kilocode: parsePlainBackendOutput,
	lmstudio: parsePlainBackendOutput,
	opencode: parsePlainBackendOutput,
	native: parsePlainBackendOutput,
	ollama: parsePlainBackendOutput,
	openai: parsePlainBackendOutput,
};

// Grok Build's headless output surfaces no tool_use/tool_result events (tools run silently),
// so its success fixture yields assistant_text + usage + done but never tool events.
const surfacesToolEvents = (backend: BackendName): boolean => backend !== 'grok';

async function readFixture(backend: BackendName, name: string): Promise<AgentEvent[]> {
	const dir = join(fixturesRoot, backend, name);
	const stdout = await readFile(join(dir, 'stdout.txt'), 'utf8').catch(() => '');
	const stderr = await readFile(join(dir, 'stderr.txt'), 'utf8').catch(() => '');
	const exitCode = Number(await readFile(join(dir, 'exit-code.txt'), 'utf8'));
	return parsers[backend](stdout, stderr, exitCode);
}

describe('backend parser fixtures', () => {
	for (const backend of Object.keys(parsers) as BackendName[]) {
		test(`${backend} success fixture emits normalized events`, async () => {
			const events = await readFixture(backend, 'success');

			expect(events.some((event) => event.type === 'assistant_text')).toBe(true);
			if (surfacesToolEvents(backend)) {
				expect(events.some((event) => event.type === 'tool_call')).toBe(true);
				expect(events.some((event) => event.type === 'tool_result')).toBe(true);
			}
			expect(events.some((event) => event.type === 'usage')).toBe(true);
			expect(events.at(-1)).toMatchObject({ type: 'done', exitCode: 0 });
		});

		test(`${backend} rate limit fixture is classified`, async () => {
			const events = await readFixture(backend, 'rate-limit');

			expect(events.some((event) => event.type === 'rate_limit')).toBe(true);
			expect(
				events.some((event) => event.type === 'error' && event.reason === 'rate_limit'),
			).toBe(true);
		});

		test(`${backend} malformed fixture preserves output and reports provider failure`, async () => {
			const events = await readFixture(backend, 'malformed');

			expect(events.some((event) => event.type === 'assistant_text')).toBe(true);
			expect(
				events.some((event) => event.type === 'error' && event.reason === 'provider'),
			).toBe(true);
		});
	}

	test('fixture set covers every backend directory', async () => {
		const directories = await readdir(fixturesRoot);
		expect(directories.sort()).toEqual(Object.keys(parsers).sort());
	});
});
