import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildApplicabilityMatrix, isAuditApplicableToProject } from 'aidd-shared';
import { evaluateAuditReportFreshness } from 'aidd-shared/metadata/audit-freshness';
import {
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { projectDependencyNames } from 'aidd-shared/metadata/project-packages';
import { readProjectAssuranceProfile } from 'aidd-shared/metadata/project-profile';

import { definitionSummary } from '../../backend/src/services/audit/auditHelpers.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// The catalog now walks a definition's projects eight at a time instead of one await at a time
// (audit-performance-1791062802). Concurrency must not change a single count: this builds a
// fleet wider than several batches, mixed profiles and report ages, and compares every count
// definitionSummary reports against a plain serial walk of the same shared functions.
const AIDD_ROOT = join(import.meta.dir, '..', '..');
const root = await testTempDir('aidd-catalog-counts-');
afterAll(async () => await removeTempTree(root));

const lowExposure = {
	authMode: 'none',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'low',
	deployment: 'local',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-10-07T00:00:00.000Z',
};
const hardened = {
	...lowExposure,
	authMode: 'tenant_rbac',
	bucket: 'public_multi_tenant',
	criticality: 'business_critical',
	dataSensitivity: 'regulated',
	deployment: 'cloud',
	externalIntegrations: 'financial_or_security',
};

async function makeFleet(): Promise<{ name: string; path: string }[]> {
	const projects: { name: string; path: string }[] = [];
	for (let index = 0; index < 27; index += 1) {
		const name = `project-${String(index).padStart(2, '0')}`;
		const path = join(root, name);
		const reports = join(path, '.aidd', 'audit-reports');
		await mkdir(reports, { recursive: true });
		await writeFile(
			join(path, '.aidd', 'project-profile.json'),
			`${JSON.stringify(index % 2 === 0 ? lowExposure : hardened, null, '\t')}\n`,
		);
		// Every third project has a fresh PERFORMANCE report, every fourth a SECURITY report
		// old enough to be stale by age; the rest are missing.
		if (index % 3 === 0) {
			await writeFile(join(reports, 'PERFORMANCE-2026-10-07.md'), '# Performance\n');
		}
		if (index % 4 === 0) {
			const file = join(reports, 'SECURITY-2026-05-01.md');
			await writeFile(file, '# Security\n');
			const old = new Date('2026-05-01T00:00:00.000Z');
			await utimes(file, old, old);
		}
		projects.push({ name, path });
	}
	return projects;
}

describe('audit catalog counts under bounded project concurrency', () => {
	test('every applicability and report-health count equals a serial walk', async () => {
		const projects = await makeFleet();
		const mapping = await loadAuditProfileMapping(AIDD_ROOT);
		const names = ['PERFORMANCE', 'SECURITY', 'PROXY_AUTH_BOUNDARY', 'UI_PARITY'];
		const matrixIndex = new Map(
			buildApplicabilityMatrix(names, mapping).map((row) => [row.auditName, row]),
		);
		const freshnessContexts = new Map();
		const profileCache = new Map();
		const summaries = await Promise.all(
			names.map((name) =>
				definitionSummary(
					name,
					projects,
					mapping,
					matrixIndex,
					freshnessContexts,
					profileCache,
					true,
					(audit) => join(AIDD_ROOT, 'audits', `${audit}.md`),
				),
			),
		);

		for (const [index, name] of names.entries()) {
			let applicable = 0;
			const health = { fresh: 0, missing: 0, stale: 0 };
			for (const project of projects) {
				const [profile, overrides, packages] = await Promise.all([
					readProjectAssuranceProfile(project.path),
					loadAuditProfileOverrides(project.path),
					projectDependencyNames(project.path),
				]);
				if (!isAuditApplicableToProject(profile, packages, name, mapping, overrides))
					continue;
				applicable += 1;
				const freshness = await evaluateAuditReportFreshness(project.path, name);
				health[
					freshness.status === 'missing'
						? 'missing'
						: freshness.status === 'stale'
							? 'stale'
							: 'fresh'
				] += 1;
			}
			const summary = summaries[index]!;
			expect({
				applicable: summary.applicableProjectCount,
				excluded: summary.excludedProjectCount,
				fresh: summary.freshReportCount,
				missing: summary.missingReportCount,
				name,
				stale: summary.staleReportCount,
			}).toEqual({
				applicable,
				excluded: projects.length - applicable,
				fresh: health.fresh,
				missing: health.missing,
				name,
				stale: health.stale,
			});
		}
		// The fleet exercised each count: some projects excluded, some reports fresh, stale and
		// missing, or the comparison above proves little.
		const performance = summaries[0]!;
		expect(performance.excludedProjectCount).toBeGreaterThan(0);
		expect(performance.freshReportCount).toBeGreaterThan(0);
		expect(performance.missingReportCount).toBeGreaterThan(0);
		expect(summaries[1]!.staleReportCount).toBeGreaterThan(0);
	});
});
