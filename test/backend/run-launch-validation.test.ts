import { expect, test } from 'bun:test';
import { parseArgs } from 'aidd-shared/args/parse';

import { HttpError } from '../../backend/src/services/errors.ts';
import { buildLaunchCommand } from '../../backend/src/services/runLauncher.ts';

test.each<{ auditNames?: string[] }>([{}, { auditNames: [] }])(
	'audit launches require an explicit selection: %j',
	async (selection) => {
		const input = { mode: 'audit' as const, projectDir: '.' };
		await expect(
			buildLaunchCommand(process.cwd(), { ...input, ...selection }, 'codex'),
		).rejects.toThrow('Select at least one audit');
	},
);

test.each(['SECURITY', '--not-a-real-flag', '--timeout', '--filter orphan'])(
	'invalid launch arguments are client errors: %s',
	async (extraArgs) => {
		try {
			await buildLaunchCommand(
				process.cwd(),
				{ auditNames: ['SECURITY'], extraArgs, mode: 'audit', projectDir: '.' },
				'codex',
			);
			throw new Error('Expected launch rejection');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect((error as HttpError).status).toBe(400);
		}
	},
);

test('explicit SECURITY selection and supported per-run limits reach the real parser', async () => {
	const command = await buildLaunchCommand(
		process.cwd(),
		{
			auditNames: ['security'],
			extraArgs: '--max-iterations 45 --timeout 43200',
			mode: 'audit',
			projectDir: '.',
		},
		'codex',
	);
	const parsed = parseArgs(command.args.slice(2));
	expect(parsed.auditNames).toEqual(['SECURITY']);
	expect(parsed.maxIterations).toBe(45);
	expect(parsed.timeoutSeconds).toBe(43200);
});

test('explicit all-audits selection remains supported', async () => {
	const command = await buildLaunchCommand(
		process.cwd(),
		{ auditAll: true, mode: 'audit', projectDir: '.' },
		'codex',
	);
	expect(parseArgs(command.args.slice(2)).auditAll).toBe(true);
});
