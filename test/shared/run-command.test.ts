import { describe, expect, test } from 'bun:test';

import { formatRunCommandArgs } from '../../shared/src/runs/command.ts';

describe('run command formatting', () => {
	test('keeps simple PowerShell-safe args bare and quotes risky values', () => {
		expect(
			formatRunCommandArgs([
				'bun',
				'd:\\applications\\aidd\\cli\\src\\index.ts',
				'--project-dir',
				'd:\\applications\\margin-planner',
				'--filter',
				'audit-*',
				'--prompt',
				"Bob's task",
			]),
		).toBe(
			"bun d:\\applications\\aidd\\cli\\src\\index.ts --project-dir d:\\applications\\margin-planner --filter 'audit-*' --prompt 'Bob''s task'",
		);
	});
});
