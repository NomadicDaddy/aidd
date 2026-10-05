import { describe, expect, test } from 'bun:test';

import { filterSuggestedArgs } from '../../shared/src/contracts/director-suggested-args.ts';

describe('Director suggested-args allowlist', () => {
	test('keeps the targeting args the deterministic producers emit', () => {
		expect(
			filterSuggestedArgs({
				auditAll: 'true',
				auditNames: 'SECURITY,HYGIENE',
				feature: 'archive-cli-command-suite',
				filterBy: 'id',
				filterValue: 'audit-*',
			}),
		).toEqual({
			auditAll: 'true',
			auditNames: 'SECURITY,HYGIENE',
			feature: 'archive-cli-command-suite',
			filterBy: 'id',
			filterValue: 'audit-*',
		});
	});

	test('drops recipe built-ins, shell-bound parameters and unsafe values', () => {
		expect(
			filterSuggestedArgs({
				application: 'other-app',
				deployCommand: 'bun run deploy',
				feature: 'x; rm -rf .',
				filterBy: 'id',
				filterValue: '$(id)',
				healthUrl: 'http://localhost',
				projectDir: 'C:/',
			}),
		).toEqual({ filterBy: 'id' });
	});
});
