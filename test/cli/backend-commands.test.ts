import { describe, expect, test } from 'bun:test';
import { buildBackendCommand } from 'aidd-shared/backends/commands';
import { resolveCommand } from 'aidd-shared/backends/process';
import { NativeBackend } from 'aidd-shared/backends/native';
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';

const input = {
	text: 'prompt',
	cwd: 'D:/applications/demo',
	model: 'test-model',
	reasoningEffort: 'low',
};

describe('backend command builders', () => {
	test('builds Claude Code stream-json invocation', () => {
		const command = buildBackendCommand('claude-code', input);
		expect(command.command).toBe('claude');
		expect(command.args).toContain('--print');
		expect(command.args).toContain('--output-format');
		expect(command.args).toContain('stream-json');
		expect(command.args).toContain('--dangerously-skip-permissions');
		expect(command.args).toContain('--no-session-persistence');
		expect(command.args).toContain('--effort');
		expect(command.args).toContain('low');
	});

	test('builds OpenCode and KiloCode command names', () => {
		const opencode = buildBackendCommand('opencode', input);
		expect(opencode.args[0]).toBe('run');
		// --format json makes the CLI emit raw JSON events so token usage can be parsed.
		expect(opencode.args.join(' ')).toContain('--format json');
		expect(opencode.args).toContain('--variant');
		expect(opencode.args).toContain('low');
		const kilo = buildBackendCommand('kilocode', input);
		expect(kilo.command).toBe('kilo');
		expect(kilo.args[0]).toBe('run');
		expect(kilo.args.join(' ')).toContain('--format json');
		expect(kilo.args).toContain('--variant');
		expect(kilo.args).toContain('low');
	});

	test('forwards Claude max effort and OpenCode/Kilo thinking controls', () => {
		const claude = buildBackendCommand('claude-code', {
			...input,
			reasoningEffort: 'max',
		});
		expect(claude.args).toContain('--effort');
		expect(claude.args).toContain('max');

		const opencode = buildBackendCommand('opencode', { ...input, thinking: true });
		const kilo = buildBackendCommand('kilocode', { ...input, thinking: true });
		expect(opencode.args).toContain('--thinking');
		expect(kilo.args).toContain('--thinking');

		const opencodeNoThinking = buildBackendCommand('opencode', { ...input, thinking: false });
		const kiloNoThinking = buildBackendCommand('kilocode', { ...input, thinking: false });
		expect(opencodeNoThinking.args).toContain('--no-thinking');
		expect(kiloNoThinking.args).toContain('--no-thinking');
	});

	test('builds Codex safety and JSON flags', () => {
		const command = buildBackendCommand('codex', input);
		expect(command.args).toContain('exec');
		expect(command.args).toContain('--json');
		expect(command.args).toContain('--skip-git-repo-check');
		expect(command.args).toContain('--dangerously-bypass-approvals-and-sandbox');
		expect(command.args).toContain('--cd');
		expect(command.args).toContain('model_reasoning_effort=low');
		expect(command.env?.SHELL).toBe('/usr/bin/bash');
	});

	test('preserves Native shorter idle defaults', () => {
		const backend = new NativeBackend();
		expect(backend.idleDefaults.nudgeMs).toBe(300_000);
		expect(backend.idleDefaults.killMs).toBe(600_000);
	});

	test('backend subprocess env preserves provider keys without unrelated secrets', () => {
		const env = buildBackendSubprocessEnv(
			{ SHELL: '/usr/bin/bash', CUSTOM_OVERRIDE: 'present' },
			{
				PATH: '/bin',
				ANTHROPIC_API_KEY: 'anthropic-key',
				OPENAI_API_KEY: 'openai-key',
				CODEX_HOME: '/tmp/codex',
				OPENCODE_CONFIG: '/tmp/opencode.json',
				KILOCODE_CONFIG: '/tmp/kilocode.json',
				AIDD_NATIVE_SIMULATION: '1',
				BUN_SECRET_SENTINEL: 'drop-bun-secret',
				NPM_TOKEN: 'drop-npm-token',
				AIDD_SECRET_SENTINEL: 'drop-me-too',
				UNRELATED_SENTINEL: 'drop-me',
				CLAUDE_EVIL: '1',
				ANTHROPIC_TELEMETRY: 'on',
				OPENAI_PROXY: 'http://attacker',
				CODEX_DEBUG: 'verbose',
				ZRUN_TRACE: '1',
				SHELL: '/bin/sh',
			},
		);

		expect(env.PATH).toBe('/bin');
		expect(env.ANTHROPIC_API_KEY).toBe('anthropic-key');
		expect(env.OPENAI_API_KEY).toBe('openai-key');
		expect(env.CODEX_HOME).toBe('/tmp/codex');
		expect(env.OPENCODE_CONFIG).toBe('/tmp/opencode.json');
		expect(env.KILOCODE_CONFIG).toBe('/tmp/kilocode.json');
		expect(env.AIDD_NATIVE_SIMULATION).toBe('1');
		expect(env.SHELL).toBe('/usr/bin/bash');
		expect(env.CUSTOM_OVERRIDE).toBe('present');
		expect(env.BUN_SECRET_SENTINEL).toBeUndefined();
		expect(env.NPM_TOKEN).toBeUndefined();
		expect(env.AIDD_SECRET_SENTINEL).toBeUndefined();
		expect(env.UNRELATED_SENTINEL).toBeUndefined();
		expect(env.CLAUDE_EVIL).toBeUndefined();
		expect(env.ANTHROPIC_TELEMETRY).toBeUndefined();
		expect(env.OPENAI_PROXY).toBeUndefined();
		expect(env.CODEX_DEBUG).toBeUndefined();
		expect(env.ZRUN_TRACE).toBeUndefined();
	});

	describe('command injection guard — buildBackendCommand rejects unsafe model values', () => {
		test('claude-code rejects model with shell metacharacters: foo & calc.exe', () => {
			expect(() =>
				buildBackendCommand('claude-code', { ...input, model: 'foo & calc.exe' }),
			).toThrow(/Unsafe model value/);
		});

		test('codex rejects model with pipe: foo|whoami', () => {
			expect(() => buildBackendCommand('codex', { ...input, model: 'foo|whoami' })).toThrow(
				/Unsafe model value/,
			);
		});

		test('codex rejects reasoningEffort with semicolon: low; rm -rf /', () => {
			expect(() =>
				buildBackendCommand('codex', {
					...input,
					model: 'gpt-4o',
					reasoningEffort: 'low; rm -rf /',
				}),
			).toThrow(/Unsafe reasoningEffort value/);
		});

		test('accepts valid model identifiers', () => {
			for (const model of [
				'claude-3.5-sonnet',
				'gpt-4o',
				'openai/gpt-4',
				'anthropic/claude-3:latest',
				'gpt-oss:20b',
			]) {
				expect(() => buildBackendCommand('claude-code', { ...input, model })).not.toThrow();
			}
		});

		test('accepts valid reasoningEffort', () => {
			const cmd = buildBackendCommand('codex', {
				...input,
				model: 'gpt-4o',
				reasoningEffort: 'high',
			});
			expect(cmd.args).toContain('model_reasoning_effort=high');
		});

		test('rejects Codex max reasoning effort', () => {
			expect(() =>
				buildBackendCommand('codex', {
					...input,
					model: 'gpt-4o',
					reasoningEffort: 'max',
				}),
			).toThrow(/Codex does not support max/);
		});
	});

	describe('resolveCommand passthrough', () => {
		test('non-Windows returns command unchanged', () => {
			// On the test platform, just verify the function returns a string
			const result = resolveCommand('bun');
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		test('absolute path is returned as-is', () => {
			const abs =
				process.platform === 'win32'
					? 'C:\\Program Files\\test\\app.exe'
					: '/usr/local/bin/app';
			expect(resolveCommand(abs)).toBe(abs);
		});
	});
});
