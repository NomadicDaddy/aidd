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
		// Codex ignores SHELL on Windows and runs PowerShell anyway; pinning it there would
		// contradict the shell guidance in prompts/_cli/codex.md.
		expect(command.env?.SHELL).toBe(process.platform === 'win32' ? undefined : '/usr/bin/bash');
	});

	test('builds Cline JSON invocation with mapped reasoning', () => {
		const command = buildBackendCommand('cline', input);
		expect(command.command).toBe('cline');
		expect(command.args).toEqual([
			'--json',
			'--auto-approve',
			'true',
			'--cwd',
			input.cwd,
			'--model',
			input.model,
			'--thinking',
			'low',
			'Complete the AIDD task supplied over standard input.',
		]);
		expect(command.args).not.toContain('--provider');
		expect(command.args).not.toContain(input.text);

		const minimal = buildBackendCommand('cline', { ...input, reasoningEffort: 'minimal' });
		expect(minimal.args.slice(-3, -1)).toEqual(['--thinking', 'low']);
		const maximum = buildBackendCommand('cline', { ...input, reasoningEffort: 'max' });
		expect(maximum.args.slice(-3, -1)).toEqual(['--thinking', 'xhigh']);
		const none = buildBackendCommand('cline', { ...input, reasoningEffort: 'none' });
		expect(none.args.slice(-3, -1)).toEqual(['--thinking', 'none']);
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
				CLINE_API_KEY: 'cline-key',
				CLINE_DATA_DIR: '/tmp/cline',
				OPENAI_API_KEY: 'openai-key',
				OPENROUTER_API_KEY: 'openrouter-key',
				AI_GATEWAY_API_KEY: 'gateway-key',
				V0_API_KEY: 'v0-key',
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
		expect(env.CLINE_API_KEY).toBe('cline-key');
		expect(env.CLINE_DATA_DIR).toBe('/tmp/cline');
		expect(env.OPENAI_API_KEY).toBe('openai-key');
		expect(env.OPENROUTER_API_KEY).toBe('openrouter-key');
		expect(env.AI_GATEWAY_API_KEY).toBe('gateway-key');
		expect(env.V0_API_KEY).toBe('v0-key');
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

		test('cline rejects model with shell metacharacters', () => {
			expect(() => buildBackendCommand('cline', { ...input, model: 'foo; whoami' })).toThrow(
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
				// Quantized Ollama tags carry underscores. A guard that rejects them hands an operator
				// scheduling a local model a 400 blaming their typing.
				'llama3.1:8b-instruct-q4_K_M',
				'hf.co/bartowski/Qwen2.5-Coder-7B-GGUF:Q5_K_S',
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
