import { describe, expect, test } from 'bun:test';
import { runProcessBackend } from 'aidd-shared/backends/process';
import type { AgentEvent } from 'aidd-shared/backends/types';

import { runBash } from '../../shared/src/agent/tools/shell.ts';
import { AGENT_MARKER_ENV } from '../../shared/src/subprocess-env.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// The repository's pre-push force-push guard refuses a rewrite only while the agent marker is in
// its environment, so the marker has to reach every process that acts for an agent: the external
// CLI the process backend spawns, whichever backend it is, and the native agent's bash tool. A
// marker that one of them drops is a guard that one of them walks past.
const cwd = testTempDirSync('agent-marker');

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const out: AgentEvent[] = [];
	for await (const event of events) out.push(event);
	return out;
}

describe('agent marker environment', () => {
	test('every external CLI the process backend spawns carries the marker', async () => {
		for (const backend of [
			'claude-code',
			'cline',
			'codex',
			'grok',
			'kilocode',
			'opencode',
		] as const) {
			const events = await collect(
				runProcessBackend(
					{
						args: [
							'-e',
							`process.stdout.write('marker=' + String(process.env.${AGENT_MARKER_ENV}) + '\\n')`,
						],
						backend,
						command: process.execPath,
					},
					{ cwd, text: 'prompt' },
					new AbortController().signal,
				),
			);
			const transcript = events
				.filter((event) => event.type === 'raw_log' && event.stream === 'stdout')
				.map((event) => (event.type === 'raw_log' ? event.chunk : ''))
				.join('');
			expect(transcript).toContain('marker=1');
		}
	});

	test('a caller override still wins over the marker', async () => {
		const events = await collect(
			runProcessBackend(
				{
					args: [
						'-e',
						`process.stdout.write('marker=' + process.env.${AGENT_MARKER_ENV})`,
					],
					backend: 'codex',
					command: process.execPath,
					env: { [AGENT_MARKER_ENV]: 'override' },
				},
				{ cwd, text: 'prompt' },
				new AbortController().signal,
			),
		);
		const transcript = events
			.filter((event) => event.type === 'raw_log' && event.stream === 'stdout')
			.map((event) => (event.type === 'raw_log' ? event.chunk : ''))
			.join('');
		expect(transcript).toContain('marker=override');
	});

	test('the native agent bash tool carries the marker', async () => {
		// A targeted printenv: the policy denies expanding a variable the command did not set
		// and denies a bare environment dump, both rightly, so this is the one spelling left.
		const output = await runBash({ command: `printenv ${AGENT_MARKER_ENV}` }, cwd);
		expect(output).toStartWith('1\n');
		expect(output).toContain('[exit code: 0]');
	});
});
