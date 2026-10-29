import { describe, expect, test } from 'bun:test';
import type { Feature } from 'aidd-shared/metadata/features';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildDirectorProjectPriority } from '../../backend/src/services/directorPriority.ts';
import type { ProjectSummaryDto } from '../../backend/src/types/project.ts';
import { testTempDir } from '../_helpers/temp.ts';

// summon, 2026-10-29: the Director offered an audit finding mapped to milestone v1.1 while v1.0
// was active, and the launched run stopped at its first step on the roadmap gate. A suggestion
// must name only records that coding's roadmap gate would let a run take.

function finding(id: string, priority: number): Feature {
	return {
		auditSource: 'DATA_ARCHITECTURE',
		dependencies: [],
		directory: id,
		id,
		passes: false,
		priority,
		status: 'backlog',
		title: id,
	} as Feature;
}

const features = [finding('audit-later', 1), finding('audit-now', 2)];

async function projectAt(roadmap: null | Record<string, unknown>): Promise<ProjectSummaryDto> {
	const path = await testTempDir('director-roadmap-');
	if (roadmap !== null) {
		await mkdir(join(path, '.aidd'), { recursive: true });
		await writeFile(join(path, '.aidd', 'roadmap.json'), JSON.stringify(roadmap));
	}
	return {
		artifactHealth: 'fresh',
		metadata: {
			artifactCheck: { summary: { requiredMissing: 0, stale: 0 } },
			maturity: { currentStageId: 'engaged' },
			profile: { bucket: 'single_user_local' },
		},
		name: 'roadmap-app',
		path,
		phase: 'coding',
		routeId: 'roadmap-app',
	} as unknown as ProjectSummaryDto;
}

async function auditBacklog(roadmap: null | Record<string, unknown>) {
	const project = await projectAt(roadmap);
	// An empty audits/ folder is a catalog with no audits, which keeps audit health out of the way.
	const catalogDir = await testTempDir('director-roadmap-catalog-');
	await mkdir(join(catalogDir, 'audits'));
	const summary = await buildDirectorProjectPriority(project, { catalogDir, features });
	return summary.backlog.audit;
}

const milestones = { 'v1.0': { priority: 1 }, 'v1.1': { priority: 2 } };

describe('director suggestions follow the roadmap gate', () => {
	test('offers only records in the active milestone, and still counts the rest', async () => {
		const audit = await auditBacklog({
			features: { 'audit-later': { milestone: 'v1.1' }, 'audit-now': { milestone: 'v1.0' } },
			milestones,
		});

		expect(audit).toMatchObject({ blockedCount: 1, count: 2, readyCount: 1 });
		expect(audit.top.map((item) => item.id)).toEqual(['audit-now']);
	});

	test('a project with no roadmap holds nothing back', async () => {
		const audit = await auditBacklog(null);

		expect(audit).toMatchObject({ blockedCount: 0, count: 2, readyCount: 2 });
	});

	test('a blocked gate offers nothing', async () => {
		const audit = await auditBacklog({
			features: { 'audit-now': { milestone: 'v1.0' } },
			milestones,
		});

		expect(audit).toMatchObject({ count: 2, readyCount: 0, top: [] });
	});
});
