import { describe, expect, test } from 'bun:test';

import { scanLines } from '../../scripts/lib/credential-disclosure/scan.ts';

const content = 'fixture credential contents that must never be printed by the detector';
const credentialPath = '~/.aidd/config.json';
const encode = (value: unknown): string => JSON.stringify(value);
const call = (id: string, path: string) => ({
	type: 'assistant',
	message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: path } }] },
});
const result = (id: string, text: string) => ({
	type: 'user',
	message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
});
const command = (cmd: string, output: string) => ({
	type: 'item.completed',
	item: {
		type: 'command_execution',
		id: 'cmd',
		command: cmd,
		status: 'completed',
		aggregated_output: output,
	},
});
const scan = (...records: unknown[]) => scanLines(records.map(encode), 'fixture.log');

describe('credential disclosure protocol evidence', () => {
	test('ignores credential paths mentioned only in Codex search output', () => {
		expect(
			scan(
				command(
					'rg -n credential docs',
					`Read ${credentialPath} only through approved settings APIs. ${content}`,
				),
			),
		).toEqual([]);
	});

	test('a long command or event envelope cannot turn empty output into disclosure', () => {
		expect(scan(command(`cat ${credentialPath} # ${content}`, ''))).toEqual([]);
	});

	test('matches Claude results by call ID across interleaved tools', () => {
		expect(
			scan(
				call('secret', credentialPath),
				call('source', 'src/main.ts'),
				result('source', content),
				result('secret', ''),
			),
		).toEqual([]);
		expect(
			scan(
				call('secret', credentialPath),
				call('source', 'src/main.ts'),
				result('source', ''),
				result('secret', content),
			),
		).toEqual([{ file: 'fixture.log', label: 'aidd user config', line: 1 }]);
	});

	test('does not arm a read from prose, a returned document, or quoted JSON', () => {
		expect(
			scan(
				{
					type: 'assistant',
					message: {
						content: [{ type: 'text', text: encode(call('quoted', credentialPath)) }],
					},
				},
				call('docs', 'docs/configuration.md'),
				result('docs', `Do not read ${credentialPath}. ${content}`),
				result('quoted', content),
			),
		).toEqual([]);
	});

	test('search tools inspect their file path, not their search pattern', () => {
		const grep = (path: string) => ({
			type: 'tool_use',
			id: 'grep',
			name: 'Grep',
			input: { path, pattern: credentialPath },
		});
		expect(scan(grep('docs'), { type: 'tool_result', tool_use_id: 'grep', content })).toEqual(
			[],
		);
		expect(
			scan(grep(credentialPath), { type: 'tool_result', tool_use_id: 'grep', content }),
		).toHaveLength(1);
	});

	test('shell searches distinguish needles and exclusions from credential file operands', () => {
		for (const cmd of [
			`git grep -n -E '${credentialPath}' -- docs`,
			`rg -n '${credentialPath}' docs`,
			`rg -n -g '!${credentialPath}' apiKey docs`,
			`printf 'Inspect ${credentialPath} carefully'; rg -n apiKey docs`,
		])
			expect(scan(command(cmd, content))).toEqual([]);
		for (const cmd of [
			`rg -n apiKey ${credentialPath}`,
			`git grep -n -e apiKey -- ${credentialPath}`,
			`rg -f ${credentialPath} docs`,
			`Get-Content -LiteralPath '${credentialPath}'`,
		])
			expect(scan(command(cmd, content))).toHaveLength(1);
	});

	test('ignores writes and unrelated results without losing real native reads', () => {
		expect(
			scan(
				{
					type: 'tool_call',
					id: 'write',
					tool: 'write_file',
					args: { path: credentialPath },
				},
				{ type: 'tool_result', id: 'write', result: content },
				{
					type: 'tool_call',
					id: 'read',
					tool: 'read_file',
					args: { path: credentialPath },
				},
				{ type: 'tool_result', id: 'other', result: content },
				{ type: 'tool_result', id: 'read', result: { content } },
			),
		).toEqual([{ file: 'fixture.log', label: 'aidd user config', line: 3 }]);
	});

	test('distinguishes metadata and exact filtered previews from unfiltered credential reads', () => {
		for (const cmd of [
			'git check-ignore -v .env',
			'git -C repo ls-files .env',
			'git log --all --oneline -- .env',
			"sed -E 's/=.*/=<redacted>/' .env",
			'cut -d= -f1 .env',
			`pwsh.exe -NoProfile -Command "git grep -n '${credentialPath}' -- docs"`,
			"grep -n API_KEY .env 2>/dev/null | sed 's/=.*/=<set>/'",
		])
			expect(scan(command(cmd, content))).toEqual([]);
		for (const cmd of [
			'git show HEAD:.env',
			'git log -p -- .env',
			'cut -d= -f2 .env',
			'cut -d= -f1 -f1,2 .env',
			"sed -n '1,20p' .env",
			"sed -e 's/=.*/=<redacted>/' -e 'r .env' .env",
			"sed 's/^PUBLIC=.*/=<redacted>/' .env",
			"sed 's/=.*/=<redacted>/' ~/.ssh/id_ed25519",
			'echo safe; cat .env',
			'rg -f.env docs',
			`pwsh.exe -NoProfile -Command "Get-Content '${credentialPath}'"`,
			"cat .env >&2 | sed 's/=.*/=<redacted>/'",
			"cat .env; sed 's/=.*/=<redacted>/' other.txt",
			'echo $(cat .env)',
			'printf \'%s\' "$(cat .env)"',
		])
			expect(scan(command(cmd, content))).toHaveLength(1);
	});

	test('reads structured native events from a pretty-printed iteration artifact', () => {
		const events = [
			{
				type: 'function_call',
				call_id: 'native',
				name: 'exec_command',
				arguments: encode({ cmd: 'cat ~/.ssh/id_ed25519' }),
			},
			{ type: 'function_call_output', call_id: 'native', output: content },
		];
		expect(
			scanLines(JSON.stringify({ events }, null, 2).split('\n'), 'iteration.json'),
		).toEqual([{ file: 'iteration.json', label: 'ssh private key material', line: 1 }]);
	});

	test('requires numeric returned evidence for an exact port-only dotenv selection', () => {
		const select = "Select-String -Path .env -Pattern '^APP_FRONTEND_PORT='";
		const port = '.env:12:APP_FRONTEND_PORT=4000';
		expect(scan(command(select, `${port}\n${content}`))).toEqual([]);
		expect(scan(command(select, `.env:12:APP_FRONTEND_PORT=${content}`))).toHaveLength(1);
		expect(scan(command(`${select}; cat .env`, `${port}\n${content}`))).toHaveLength(1);
		expect(
			scan(command("Select-String -Path .env -Pattern '^API_KEY='", content)),
		).toHaveLength(1);
	});

	test('browser request text is not a local-file operand, while file bodies and substitutions remain checked', () => {
		expect(
			scan(
				command(
					`agent-browser request POST /notes --body '{"note":"Inspect .env carefully"}'`,
					content,
				),
			),
		).toEqual([]);
		expect(
			scan(command('agent-browser request POST /notes --body-file .env', content)),
		).toHaveLength(1);
		expect(
			scan(command('agent-browser request POST /notes --body "$(cat .env)"', content)),
		).toHaveLength(1);
	});

	test('retains evidence in raw transport chunks, including split JSON records', () => {
		const raw = (chunk: string) => ({ type: 'raw_log', stream: 'stdout', chunk });
		const request = encode(call('raw-read', credentialPath));
		expect(
			scan(
				raw(request.slice(0, 20)),
				raw(`${request.slice(20)}\n`),
				raw(encode(result('raw-read', content))),
			),
		).toEqual([{ file: 'fixture.log', label: 'aidd user config', line: 1 }]);
		expect(
			scan(
				raw(
					`${encode({ type: 'item.completed', item: { type: 'agent_message', text: encode(call('quoted', credentialPath)) } })}\n`,
				),
				raw(`${encode(result('quoted', content))}\n`),
			),
		).toEqual([]);
	});
});
