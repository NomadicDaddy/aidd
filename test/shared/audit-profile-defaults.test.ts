import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildApplicabilityMatrix } from '../../shared/src/contracts/audit-profile-mapping.ts';
import { projectAssuranceBuckets } from '../../shared/src/contracts/project-profile.ts';
import { loadAuditProfileMapping } from '../../shared/src/metadata/audit-profile-mapping.ts';

const repoRoot = join(import.meta.dir, '..', '..');

describe('seeded audit profile defaults', () => {
	test('keeps UI_PARITY inapplicable to every bucket until explicitly enabled', async () => {
		const mapping = await loadAuditProfileMapping(repoRoot);
		const rule = mapping.rules.find(({ id }) => id === 'ui-parity-default-disabled');
		const [row] = buildApplicabilityMatrix(['UI_PARITY'], mapping);

		expect(rule).toMatchObject({
			audits: ['UI_PARITY'],
			effect: 'disabled',
			match: {},
		});
		expect(row).toBeDefined();
		for (const bucket of projectAssuranceBuckets) {
			expect(row?.byBucket[bucket].applies).toBe(false);
		}
	});
});
