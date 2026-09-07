import { describe, expect, test } from 'bun:test';
import { parseArgs } from 'aidd-shared/args/index';
import { formatConfigMatrix } from '../../cli/src/config-matrix.ts';
import { resolveMergedConfig } from 'aidd-shared/config';

describe('config matrix', () => {
	test('parses the config matrix flag', () => {
		const args = parseArgs(['--config-matrix']);

		expect(args.configMatrix).toBe(true);
	});

	test('formats effective defaults without secrets', () => {
		const config = resolveMergedConfig({
			cli: 'codex',
			reasoningEffort: 'high',
			backends: {
				codex: {
					model: 'gpt-5.6-sol',
				},
			},
			defaultProvider: 'zhipu',
			directAi: {
				enabled: true,
				surfaces: {
					directorChat: true,
					directorCycle: true,
					projectAdvisor: true,
				},
			},
			providers: {
				zhipu: {
					apiKey: 'secret',
					model: 'glm-5.3',
					reasoningEffort: 'high',
				},
			},
		});

		const output = formatConfigMatrix(config);

		expect(output).toContain('User config:    ');
		expect(output).toContain('Project config: none');
		expect(output).toContain(
			'| Normal run / web Runs launch         | codex        | not configured | gpt-5.6-sol',
		);
		expect(output).toContain(
			'| Direct AI project advisor            | direct-ai    | zhipu          | glm-5.3',
		);
		expect(output).toContain(
			'| Direct AI director chat              | direct-ai    | zhipu          | gpt-5.6-sol',
		);
		expect(output).toContain('| Triumvirate                          | not runnable | n/a');
		expect(output).toContain('Missing secondaryCli, overseerCli. No triumvirate config found.');
		expect(output).not.toContain('secret');
	});

	test('explains partial triumvirate config instead of only saying not runnable', () => {
		const config = resolveMergedConfig({
			cli: 'codex',
			reasoningEffort: 'high',
			triumvirate: {
				secondaryCli: 'native',
				secondaryModel: 'glm-5.3',
				execCli: 'native',
				execModel: 'glm-5.3',
			},
		});

		const output = formatConfigMatrix(config);

		expect(output).toContain('| Triumvirate');
		expect(output).toContain('| not runnable |');
		expect(output).toContain('Missing overseerCli.');
		expect(output).toContain('Configured secondaryCli=native, execCli=native.');
		expect(output).toContain('execCli is execution-only and does not replace overseerCli.');
	});
});
