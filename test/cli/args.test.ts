import { describe, expect, test } from 'bun:test';
import { ArgsError, parseArgs } from 'aidd-shared/args/index';

describe('parseArgs', () => {
	test('preserves representative public flags', () => {
		const args = parseArgs([
			'--project-dir',
			'd:/applications/taskboard',
			'--cli',
			'codex',
			'--feature',
			'account-lockout',
			'--filter-by',
			'category',
			'--filter',
			'Backend',
			'--no-stop-when-done',
		]);

		expect(args.projectDir).toBe('d:/applications/taskboard');
		expect(args.cli).toBe('codex');
		expect(args.feature).toBe('account-lockout');
		expect(args.filterBy).toBe('category');
		expect(args.filterValue).toBe('Backend');
		expect(args.stopWhenDone).toBe(false);
	});

	test('parses optional interview file', () => {
		expect(parseArgs(['--interview']).interviewFile).toBeUndefined();
		expect(parseArgs(['--interview', 'questions.md']).interviewFile).toBe('questions.md');
	});

	test('parses --audit-findings with an optional source operand', () => {
		const bare = parseArgs(['--audit-findings']);
		expect(bare.auditFindings).toBe(true);
		expect(bare.auditFindingsSource).toBeUndefined();

		const withSource = parseArgs(['--audit-findings', 'SECURITY']);
		expect(withSource.auditFindings).toBe(true);
		expect(withSource.auditFindingsSource).toBe('SECURITY');

		// A following flag is not swallowed as the source operand.
		const withNextFlag = parseArgs(['--audit-findings', '--cli', 'codex']);
		expect(withNextFlag.auditFindings).toBe(true);
		expect(withNextFlag.auditFindingsSource).toBeUndefined();
		expect(withNextFlag.cli).toBe('codex');
	});

	test('rejects a space-separated value that begins with --', () => {
		// The bare `--flag value` form treats a `--`-leading next token as a missing value;
		// this is what made a UI "directive" of `--filter-by id ...` crash as `--prompt
		// requires a value`.
		expect(() => parseArgs(['--prompt', '--filter-by'])).toThrow(ArgsError);
	});

	test('accepts a --flag=value value that begins with --', () => {
		const args = parseArgs(['--prompt=--filter-by id --filter audit-*']);
		expect(args.customPrompt).toBe('--filter-by id --filter audit-*');
	});

	test('parses --flag=value for normal values and splits on the first =', () => {
		expect(parseArgs(['--cli=codex']).cli).toBe('codex');
		expect(parseArgs(['--cli=cline']).cli).toBe('cline');
		expect(parseArgs(['--max-iterations=3']).maxIterations).toBe(3);
		expect(parseArgs(['--prompt=a=b']).customPrompt).toBe('a=b');
		// A non-flag token containing = is left untouched.
		expect(parseArgs(['--filter-by', 'id', '--filter', 'key=val']).filterValue).toBe('key=val');
	});

	test('budget flags: --max-cost-usd accepts decimals, --max-tokens is integer-only', () => {
		expect(parseArgs(['--max-cost-usd', '0.01']).maxCostUsd).toBe(0.01);
		expect(parseArgs(['--max-cost-usd=2.5']).maxCostUsd).toBe(2.5);
		expect(parseArgs(['--max-tokens', '100000']).maxTokens).toBe(100000);
		expect(() => parseArgs(['--max-cost-usd', '-1'])).toThrow(ArgsError);
		expect(() => parseArgs(['--max-tokens', '1.5'])).toThrow(ArgsError);
	});

	test('parses internal fresh-project Git init flag', () => {
		expect(parseArgs(['--project-dir', 'd:/applications/demo']).initGitAfterScaffold).toBe(
			false,
		);
		expect(
			parseArgs(['--project-dir', 'd:/applications/demo', '--init-git-after-scaffold'])
				.initGitAfterScaffold,
		).toBe(true);
	});

	test('parses the blueprint implementation boundary flag', () => {
		expect(parseArgs([]).stopBeforeImplementation).toBe(false);
		expect(parseArgs(['--stop-before-implementation']).stopBeforeImplementation).toBe(true);
	});

	test('parses skill invocation flags', () => {
		const args = parseArgs([
			'--project-dir',
			'd:/applications/demo',
			'--skill',
			'update-screen-map',
			'--skill-args',
			'demo --dry-run',
		]);

		expect(args.skillId).toBe('update-screen-map');
		expect(args.skillArgs).toBe('demo --dry-run');
		expect(() => parseArgs(['--skill-args', 'demo'])).toThrow(ArgsError);
		expect(() => parseArgs(['--skill', 'demo', '--prompt', 'do work'])).toThrow(ArgsError);
	});

	test('accepts dash-leading skill args only in the inline spelling', () => {
		// Skill args are usually flags. The space-separated form cannot carry them (the value reads
		// as a missing value), so callers building argv programmatically must use `--flag=value`.
		const args = parseArgs([
			'--skill',
			'feature-coverage-audit',
			'--skill-args=--apply --include-completed',
		]);
		expect(args.skillArgs).toBe('--apply --include-completed');
		expect(() =>
			parseArgs(['--skill', 'feature-coverage-audit', '--skill-args', '--apply']),
		).toThrow(ArgsError);
	});

	test('rejects retired command and prior catalog flags', () => {
		expect(() => parseArgs(['--command', 'update-roadmap'])).toThrow(ArgsError);
		expect(() => parseArgs([`--${'ingre'}${'dient'}`, 'bug2feature'])).toThrow(ArgsError);
	});

	test('parses web mode and validates the web port', () => {
		const args = parseArgs(['--web', '--port', '43210']);

		expect(args.webMode).toBe(true);
		expect(args.webPort).toBe(43210);
		expect(() => parseArgs(['--web', '--port', '0'])).toThrow(ArgsError);
		expect(() => parseArgs(['--web', '--port', '65536'])).toThrow(ArgsError);
	});

	test('parses mcp mode', () => {
		expect(parseArgs(['--mcp']).mcpMode).toBe(true);
		expect(parseArgs([]).mcpMode).toBe(false);
	});

	test('rejects retired bridge mode', () => {
		expect(() => parseArgs(['--bridge'])).toThrow(ArgsError);
	});

	test('reports invalid enum-style arguments as argument errors', () => {
		expect(() => parseArgs(['--cli', 'nope'])).toThrow(ArgsError);
		expect(() => parseArgs(['--triumvirate', '--secondary-cli', 'nope'])).toThrow(ArgsError);
		expect(() => parseArgs(['--reasoning-effort', 'maximum'])).toThrow(ArgsError);
	});

	test('normalizes benchmark reasoning and thinking flags', () => {
		expect(parseArgs(['--reasoning-effort', 'extra high']).reasoningEffort).toBe('xhigh');
		expect(parseArgs(['--reasoning-effort', 'max']).reasoningEffort).toBe('max');
		expect(parseArgs(['--thinking']).thinking).toBe(true);
		expect(parseArgs(['--no-thinking']).thinking).toBe(false);
		expect(parseArgs(['--thinking-level', 'HIGH']).thinkingLevel).toBe('high');
		expect(() => parseArgs(['--no-thinking', '--thinking-level', 'low'])).toThrow(ArgsError);
	});

	test('rejects internal CLI backend name', () => {
		expect(() => parseArgs(['--cli', 'internal'])).toThrow(ArgsError);
		expect(() =>
			parseArgs([
				'--triumvirate',
				'--secondary-cli',
				'codex',
				'--overseer-cli',
				'claude-code',
				'--exec-cli',
				'internal',
			]),
		).toThrow(ArgsError);
	});

	test('parses triumvirate role flags and rejects unsupported combinations', () => {
		const args = parseArgs([
			'--triumvirate',
			'--secondary-cli',
			'codex',
			'--secondary-model',
			'gpt-secondary',
			'--overseer-cli',
			'claude-code',
			'--overseer-model',
			'overseer-model',
			'--exec-cli',
			'native',
			'--exec-model',
			'exec-model',
		]);

		expect(args.triumvirateMode).toBe(true);
		expect(args.secondaryCli).toBe('codex');
		expect(args.secondaryModel).toBe('gpt-secondary');
		expect(args.overseerCli).toBe('claude-code');
		expect(args.overseerModel).toBe('overseer-model');
		expect(args.execCli).toBe('native');
		expect(args.execModel).toBe('exec-model');
		expect(() => parseArgs(['--triumvirate', '--web'])).toThrow(ArgsError);
		expect(() => parseArgs(['--triumvirate', '--director'])).toThrow(ArgsError);
		expect(() => parseArgs(['--triumvirate', '--interview'])).toThrow(ArgsError);
		expect(() => parseArgs(['--triumvirate', '--check-features'])).toThrow(ArgsError);
		expect(() => parseArgs(['--triumvirate', '--check-artifacts'])).toThrow(ArgsError);
	});

	test('validates filter pairing and field names', () => {
		expect(() => parseArgs(['--filter-by', 'status'])).toThrow(ArgsError);
		expect(() => parseArgs(['--filter', 'backlog'])).toThrow(ArgsError);
		expect(() => parseArgs(['--filter-by', 'unknown', '--filter', 'value'])).toThrow(ArgsError);
	});
});
