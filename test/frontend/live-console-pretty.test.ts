import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
	type ConsoleEntry,
	entrySearchText,
	parseConsoleEntries,
} from '../../frontend/src/pages/runs/consoleEntries.ts';
import { unescapeShellQuotes } from '../../frontend/src/pages/runs/consoleEntryText.ts';
import { readViewPreference } from '../../frontend/src/pages/runs/liveConsolePrefs.ts';
import { extractStopDetail } from '../../frontend/src/pages/runs/stopDetail.ts';

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

const PWSH = '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo bun test';

function codexCommandStarted(id: string, command: string): string {
	return JSON.stringify({
		item: { command, id, type: 'command_execution' },
		type: 'item.started',
	});
}

function codexCommandCompleted(
	id: string,
	command: string,
	exitCode: number,
	output: string,
): string {
	return JSON.stringify({
		item: {
			aggregated_output: output,
			command,
			exit_code: exitCode,
			id,
			type: 'command_execution',
		},
		type: 'item.completed',
	});
}

describe('parseConsoleEntries (codex)', () => {
	test('pairs command start/completion into one tool entry with decoded title', () => {
		const entries = parseConsoleEntries(
			[
				codexCommandStarted('item_1', PWSH),
				codexCommandCompleted('item_1', PWSH, 0, 'all green'),
			].join('\n'),
			'codex',
		);
		expect(entries).toHaveLength(1);
		const tool = entries[0] as Extract<ConsoleEntry, { kind: 'tool' }>;
		expect(tool.kind).toBe('tool');
		// JSON-decoded: single backslashes, no \\\\ escaping.
		expect(tool.title).toBe(PWSH);
		expect(tool.exitCode).toBe(0);
		expect(tool.output).toBe('all green');
	});

	test('renders agent messages as text entries and turn usage as a token line', () => {
		const entries = parseConsoleEntries(
			[
				JSON.stringify({
					item: { text: 'All done.', type: 'agent_message' },
					type: 'item.completed',
				}),
				JSON.stringify({
					type: 'turn.completed',
					usage: { cached_input_tokens: 1000, input_tokens: 1234, output_tokens: 56 },
				}),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([
			{ kind: 'text', text: 'All done.' },
			{ kind: 'usage', text: 'tokens: 1,234 in · 1,000 cached · 56 out' },
		]);
	});

	test('a completion without a matching start still yields a standalone tool entry', () => {
		const entries = parseConsoleEntries(
			codexCommandCompleted('item_9', PWSH, 1, 'boom'),
			'codex',
		);
		expect(entries).toHaveLength(1);
		const tool = entries[0] as Extract<ConsoleEntry, { kind: 'tool' }>;
		expect(tool.exitCode).toBe(1);
		expect(tool.output).toBe('boom');
	});

	test('recognized advisories become warnings and turn failures become errors', () => {
		const advisory = 'Skill descriptions were shortened to fit the 90% skills context budget.';
		const entries = parseConsoleEntries(
			[
				JSON.stringify({
					item: { message: advisory, type: 'error' },
					type: 'item.completed',
				}),
				JSON.stringify({ error: { message: 'provider exploded' }, type: 'turn.failed' }),
			].join('\n'),
			'codex',
		);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ kind: 'note', tone: 'warning' });
		expect(entries[1]).toEqual({ kind: 'note', text: 'provider exploded', tone: 'error' });
	});

	test('the same failure reported at item and turn level renders one error note', () => {
		const flagged = 'This content was flagged for possible cybersecurity risk.';
		const entries = parseConsoleEntries(
			[
				JSON.stringify({
					item: { message: flagged, type: 'error' },
					type: 'item.completed',
				}),
				JSON.stringify({ error: { message: flagged }, type: 'turn.failed' }),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([{ kind: 'note', text: flagged, tone: 'error' }]);
	});

	test('ignorable envelopes are dropped while non-JSON lines merge into raw blocks', () => {
		const entries = parseConsoleEntries(
			[
				JSON.stringify({ type: 'turn.started' }),
				'warning: something odd on stderr',
				'second plain line',
				JSON.stringify({ item: { type: 'reasoning' }, type: 'item.started' }),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([
			{ kind: 'raw', text: 'warning: something odd on stderr\nsecond plain line' },
		]);
	});

	test('ANSI escape sequences are stripped from raw lines and tool output', () => {
		const entries = parseConsoleEntries(
			[
				'[91mPropertyNotFoundException[0m at get.ps1:3',
				codexCommandStarted('item_1', 'bun test'),
				codexCommandCompleted('item_1', 'bun test', 0, '[32mall green[0m'),
			].join('\n'),
			'codex',
		);
		expect(entries[0]).toEqual({
			kind: 'raw',
			text: 'PropertyNotFoundException at get.ps1:3',
		});
		const tool = entries[1] as Extract<ConsoleEntry, { kind: 'tool' }>;
		expect(tool.output).toBe('all green');
	});

	test('out-of-order completions pair by codex item id, not name order', () => {
		const entries = parseConsoleEntries(
			[
				codexCommandStarted('item_1', 'slow-cmd'),
				codexCommandStarted('item_2', 'fast-cmd'),
				codexCommandCompleted('item_2', 'fast-cmd', 0, 'fast output'),
				codexCommandCompleted('item_1', 'slow-cmd', 1, 'slow output'),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([
			{
				exitCode: 1,
				kind: 'tool',
				output: 'slow output',
				title: 'slow-cmd',
				tool: 'bash',
			},
			{
				exitCode: 0,
				kind: 'tool',
				output: 'fast output',
				title: 'fast-cmd',
				tool: 'bash',
			},
		]);
	});

	test('foreign-backend triumvirate stage lines still render under a codex primary', () => {
		const entries = parseConsoleEntries(
			[
				'# triumvirate:review',
				JSON.stringify({
					message: {
						content: [{ text: 'Secondary reviewer answer.', type: 'text' }],
					},
				}),
				// Owned-but-ignored codex framing must stay silent, not fall through.
				JSON.stringify({ type: 'turn.started' }),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([
			{ kind: 'raw', text: '# triumvirate:review' },
			{ kind: 'text', text: 'Secondary reviewer answer.' },
		]);
	});

	// The test above uses a claude-code-shaped message envelope, which the plain fallback already
	// understood. These are real OpenCode/Kilo envelopes, which it does not: routing them only to
	// the plain parser dropped the entire stage, and the fallback was additionally gated on the
	// primary exposing an `ownsLine`, so a claude-code primary got no foreign handling at all.
	test('non-plain foreign envelopes render under every JSON-transcript primary', () => {
		const stage = [
			JSON.stringify({ part: { text: 'Reviewing the README now.' }, type: 'text' }),
			JSON.stringify({
				part: {
					state: { input: { command: 'bun test' }, output: 'ok', status: 'completed' },
					tool: 'bash',
				},
				type: 'tool_use',
			}),
			JSON.stringify({
				part: { tokens: { cache: { read: 5 }, input: 10, output: 2 } },
				type: 'step_finish',
			}),
		].join('\n');
		for (const primary of ['claude-code', 'cline', 'codex', 'grok', 'kilocode']) {
			expect(parseConsoleEntries(stage, primary)).toEqual([
				{ kind: 'text', text: 'Reviewing the README now.' },
				{ kind: 'tool', output: 'ok', title: 'bun test', tool: 'bash' },
				{ kind: 'usage', text: 'tokens: 15 in · 5 cached · 2 out' },
			]);
		}
	});

	test('long tool output is clamped for rendering and flagged as truncated', () => {
		const entries = parseConsoleEntries(
			[
				codexCommandStarted('item_1', 'bun test'),
				codexCommandCompleted('item_1', 'bun test', 0, 'x'.repeat(5000)),
			].join('\n'),
			'codex',
		);
		const tool = entries[0] as Extract<ConsoleEntry, { kind: 'tool' }>;
		expect(tool.output?.length).toBe(4001);
		expect(tool.outputTruncated).toBe(true);
	});
});

describe('parseConsoleEntries reasoning interstitials', () => {
	test('codex reasoning items surface once, from the completed envelope only', () => {
		const entries = parseConsoleEntries(
			[
				JSON.stringify({
					item: { id: 'item_2', type: 'reasoning' },
					type: 'item.started',
				}),
				JSON.stringify({
					item: { id: 'item_2', text: 'Weighing both options.', type: 'reasoning' },
					type: 'item.completed',
				}),
			].join('\n'),
			'codex',
		);
		expect(entries).toEqual([{ kind: 'reasoning', text: 'Weighing both options.' }]);
	});

	test('claude-code thinking blocks precede the text of the same message', () => {
		const entries = parseConsoleEntries(
			JSON.stringify({
				message: {
					content: [
						{ signature: 'abc', thinking: 'The user wants a fix.', type: 'thinking' },
						{ text: 'Fixing it now.', type: 'text' },
					],
				},
				type: 'assistant',
			}),
			'claude-code',
		);
		expect(entries).toEqual([
			{ kind: 'reasoning', text: 'The user wants a fix.' },
			{ kind: 'text', text: 'Fixing it now.' },
		]);
	});

	test('grok thought and text deltas merge into one reasoning and one text entry', () => {
		const entries = parseConsoleEntries(
			[
				JSON.stringify({ data: 'The user wants', type: 'thought' }),
				JSON.stringify({ data: ' a greeting.', type: 'thought' }),
				JSON.stringify({ data: 'Hello', type: 'text' }),
				JSON.stringify({ data: ' there.', type: 'text' }),
			].join('\n'),
			'grok',
		);
		expect(entries).toEqual([
			{ kind: 'reasoning', text: 'The user wants a greeting.' },
			{ kind: 'text', text: 'Hello there.' },
		]);
	});
});

describe('parseConsoleEntries (cline)', () => {
	test('the finalize-held run_result answer and usage surface in pretty entries', () => {
		const entries = parseConsoleEntries(
			[
				JSON.stringify({
					event: {
						contentType: 'reasoning',
						reasoning: 'Planning the fix.',
						type: 'content_start',
					},
					type: 'agent_event',
				}),
				JSON.stringify({
					text: 'Final Cline answer.',
					type: 'run_result',
					usage: { input_tokens: 10, output_tokens: 5 },
				}),
			].join('\n'),
			'cline',
		);
		expect(entries).toEqual([
			{ kind: 'reasoning', text: 'Planning the fix.' },
			{ kind: 'usage', text: 'tokens: 10 in · 5 out' },
			{ kind: 'text', text: 'Final Cline answer.' },
		]);
	});

	test('legacy say transcripts surface the withheld final answer', () => {
		const entries = parseConsoleEntries(
			JSON.stringify({ text: 'Legacy final answer.', type: 'say' }),
			'cline',
		);
		expect(entries).toEqual([{ kind: 'text', text: 'Legacy final answer.' }]);
	});
});

describe('parseConsoleEntries (other backends)', () => {
	test('claude-code content blocks yield prose and titled tool calls', () => {
		const entries = parseConsoleEntries(
			JSON.stringify({
				message: {
					content: [
						{ text: 'Reading the file now.', type: 'text' },
						{ input: { file_path: 'src/a.ts' }, name: 'Read', type: 'tool_use' },
					],
				},
			}),
			'claude-code',
		);
		expect(entries[0]).toEqual({ kind: 'text', text: 'Reading the file now.' });
		expect(entries[1]).toMatchObject({ kind: 'tool', title: 'Read src/a.ts', tool: 'Read' });
	});

	test('an unknown backend falls back to the plain parser tagged-line format', () => {
		const entries = parseConsoleEntries('[ASSISTANT] hello from a plain log', undefined);
		expect(entries).toEqual([{ kind: 'text', text: 'hello from a plain log' }]);
	});
});

describe('entrySearchText', () => {
	test('covers tool title, detail, and output so find matches decoded paths', () => {
		const haystack = entrySearchText({
			detail: 'cwd D:/applications/aidd',
			kind: 'tool',
			output: 'exit ok',
			title: PWSH,
			tool: 'bash',
		});
		expect(haystack).toContain('pwsh.exe');
		expect(haystack).toContain('D:/applications/aidd');
		expect(haystack).toContain('exit ok');
	});
});

describe('LiveConsolePretty rendering', () => {
	function renderPretty(transcript: string, backend: string): string {
		const script = [
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { parseConsoleEntries } from './src/pages/runs/consoleEntries.ts';",
			"import { LiveConsolePretty } from './src/pages/runs/LiveConsolePretty.tsx';",
			`const entries = parseConsoleEntries(${JSON.stringify(transcript)}, ${JSON.stringify(backend)});`,
			"console.log(renderToStaticMarkup(createElement(LiveConsolePretty, { entries, find: '' })));",
		].join('\n');
		const result = Bun.spawnSync([process.execPath, '-e', script], {
			cwd: resolve(import.meta.dir, '../../frontend'),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		if (result.exitCode !== 0) {
			throw new Error(new TextDecoder().decode(result.stderr));
		}
		return new TextDecoder().decode(result.stdout).trim();
	}

	test('renders paired commands with exit chips, agent prose, and italic reasoning', () => {
		const html = renderPretty(
			[
				JSON.stringify({
					item: { id: 'item_0', text: 'Checking the suite first.', type: 'reasoning' },
					type: 'item.completed',
				}),
				codexCommandStarted('item_1', PWSH),
				codexCommandCompleted('item_1', PWSH, 1, 'test failed'),
				JSON.stringify({
					item: { text: 'The suite is red.', type: 'agent_message' },
					type: 'item.completed',
				}),
			].join('\n'),
			'codex',
		);
		expect(html).toContain('pwsh.exe');
		expect(html).toContain('exit 1');
		expect(html).toContain('The suite is red.');
		expect(html).toContain('test failed');
		expect(html).toMatch(/<p[^>]*italic[^>]*>Checking the suite first\.<\/p>/);
	});
});

describe('LiveConsole wiring', () => {
	test('the console defaults to the pretty view and mounts both views behind a toggle', async () => {
		const source = await readFile(
			join(FRONTEND_SRC, 'pages', 'runs', 'LiveConsole.tsx'),
			'utf8',
		);
		expect(source).toContain('LiveConsolePretty');
		expect(source).toContain('LiveConsoleControls');
		// With no stored preference (sessionStorage is absent here), the console opens pretty.
		expect(readViewPreference()).toBe('pretty');
		const controls = await readFile(
			join(FRONTEND_SRC, 'pages', 'runs', 'LiveConsoleControls.tsx'),
			'utf8',
		);
		expect(controls).toContain("aria-pressed={view === 'pretty'}");
		expect(controls).toContain("aria-pressed={view === 'raw'}");
	});
});

describe('shell-quoted command titles', () => {
	test('a codex command title reads as the command an operator would type', () => {
		// Codex renders argv as one shell-quoted string, so every Windows command arrives with a
		// doubled program path. Both the raw title and the pretty entry must collapse it.
		const quoted = '"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe" -Command "rg -n foo"';
		const readable = '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "rg -n foo"';
		expect(unescapeShellQuotes(quoted)).toBe(readable);

		const entries = parseConsoleEntries(
			[
				codexCommandStarted('item_1', quoted),
				codexCommandCompleted('item_1', quoted, 0, 'ok'),
			].join('\n'),
			'codex',
		);
		const tool = entries[0] as Extract<ConsoleEntry, { kind: 'tool' }>;
		expect(tool.title).toBe(readable);
		// Find-in-console searches what the operator sees, not the escaped source.
		expect(entrySearchText(tool)).toContain('C:\\Program Files\\PowerShell');
	});

	test('an escaped quote becomes content and does not flip the quoting state', () => {
		expect(unescapeShellQuotes('pwsh -Command "say \\"hi\\" now"')).toBe(
			'pwsh -Command "say "hi" now"',
		);
	});

	test('single-quoted spans keep their backslashes, since no shell escapes inside them', () => {
		// A regex argument is the case a blind global replace would corrupt.
		const command = "rg -n 'a\\\\d+' src";
		expect(unescapeShellQuotes(command)).toBe(command);
		expect(unescapeShellQuotes('bun test')).toBe('bun test');
	});
});

describe('extractStopDetail', () => {
	function agentMessage(text: string): string {
		return JSON.stringify({ item: { text, type: 'agent_message' }, type: 'item.completed' });
	}

	test('collapses the structured result payload but keeps the message prose', () => {
		const report = {
			auditFindings: [{ title: 'Extract the matcher' }],
			reportMarkdown: '# H\n',
		};
		const detail = extractStopDetail(
			agentMessage(`I have done my best.\n\nAIDD_RESULT: ${JSON.stringify(report)}`),
		);
		expect(detail).toBe('I have done my best.\n\nAIDD_RESULT: { … }');
		expect(detail).not.toContain('auditFindings');
	});

	test('a message that is only the payload reports no stop detail', () => {
		expect(extractStopDetail(agentMessage('AIDD_RESULT: {"passes":true}'))).toBeNull();
	});

	test('a message that merely mentions the marker inline is left intact', () => {
		const text = 'Finish by emitting AIDD_RESULT: {"passes":true} on its own line.';
		expect(extractStopDetail(agentMessage(text))).toBe(text);
	});

	test('a truncated payload is left as written rather than cut to nowhere', () => {
		const text = 'Stopping early.\n\nAIDD_RESULT: {"passes":';
		expect(extractStopDetail(agentMessage(text))).toBe(text);
	});

	test('the last message wins and non-codex output yields nothing', () => {
		const log = [agentMessage('First pass.'), agentMessage('Stopping: worktree dirty.')].join(
			'\n',
		);
		expect(extractStopDetail(log)).toBe('Stopping: worktree dirty.');
		expect(extractStopDetail('plain log text\n')).toBeNull();
		expect(extractStopDetail('')).toBeNull();
	});
});

describe('parseConsoleEntries (native)', () => {
	test('renders the run log as structured entries with no raw fallthrough', () => {
		const entries = parseConsoleEntries(
			[
				'[reasoning…]',
				"I'll review the README.",
				'→ read README.md',
				'$ bun test',
				'[reasoning… 7.5k chars]',
				'[done] exit 0',
			].join('\n'),
			'native',
		);
		expect(entries.map((entry) => entry.kind)).toEqual(['text', 'tool', 'tool']);
		expect(entries).toContainEqual({
			kind: 'tool',
			title: 'read_file README.md',
			tool: 'read_file',
		});
	});

	test('other backends still surface unrecognized plain lines as raw', () => {
		const entries = parseConsoleEntries('[reasoning…]\nsome stray stderr\n', 'claude-code');
		expect(entries).toEqual([{ kind: 'raw', text: '[reasoning…]\nsome stray stderr' }]);
	});
});
