import { afterAll, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// GET /api/v1/audits builds every audit's summary at once over every project. The per-listing
// profile cache used to be filled only when a load finished, so all the audits that reached a
// project while its first load was pending loaded it again: 1,240 loads for 54 projects, and the
// route took about 7.8 s. The cache now holds the pending load.
const real = await import('aidd-shared/metadata/project-profile');
// Taken before mocking: mock.module rewrites the live namespace, so real.* would call the mock.
const readProfile = real.readProjectAssuranceProfile;
let profileLoads = 0;
await mock.module('aidd-shared/metadata/project-profile', () => ({
	...real,
	readProjectAssuranceProfile: async (projectPath: string) => {
		profileLoads++;
		await Bun.sleep(5);
		return await readProfile(projectPath);
	},
}));
const { definitionSummary } = await import('../../backend/src/services/audit/auditHelpers.ts');
const { buildApplicabilityMatrix } = await import('aidd-shared');

const root = mkdtempSync(join(tmpdir(), 'aidd-profile-cache-'));
afterAll(async () => await removeTempTree(root));

describe('the audit catalog profile cache', () => {
	test('loads each project once however many audits reach it at the same time', async () => {
		const projects = ['one', 'two', 'three'].map((name) => ({ name, path: join(root, name) }));
		const names = ['FRONTEND', 'LIGHTHOUSE', 'PERFORMANCE', 'SECURITY', 'TESTING'];
		const mapping = { requiresPackages: {}, rules: [], version: 1 as const };
		const matrixIndex = new Map(
			buildApplicabilityMatrix(names, mapping).map((row) => [row.auditName, row]),
		);
		const cache = new Map();
		profileLoads = 0;
		const summaries = await Promise.all(
			names.map((name) =>
				definitionSummary(
					name,
					projects,
					mapping,
					matrixIndex,
					new Map(),
					cache,
					true,
					(audit) => join(root, `${audit}.md`),
				),
			),
		);
		expect(summaries).toHaveLength(names.length);
		expect(profileLoads).toBe(projects.length);
	});
});
