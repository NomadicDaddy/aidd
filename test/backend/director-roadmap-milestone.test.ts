import { describe, expect, test } from 'bun:test';
import type { Feature } from 'aidd-shared/metadata/features';
import { type Roadmap, roadmapSchema } from 'aidd-shared/metadata/roadmap';
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

// A string is written as the file's raw text, so a test can supply an unreadable roadmap.
type RoadmapFile = null | Record<string, unknown> | string;

async function projectAt(roadmap: RoadmapFile): Promise<ProjectSummaryDto> {
	const path = await testTempDir('director-roadmap-');
	if (roadmap !== null) {
		const text = typeof roadmap === 'string' ? roadmap : JSON.stringify(roadmap);
		await mkdir(join(path, '.aidd'), { recursive: true });
		await writeFile(join(path, '.aidd', 'roadmap.json'), text);
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

async function priorityFor(roadmap: RoadmapFile, known?: Roadmap) {
	const project = await projectAt(roadmap);
	// An empty audits/ folder is a catalog with no audits, which keeps audit health out of the way.
	const catalogDir = await testTempDir('director-roadmap-catalog-');
	await mkdir(join(catalogDir, 'audits'));
	return buildDirectorProjectPriority(project, {
		catalogDir,
		features,
		...(known !== undefined ? { roadmap: known } : {}),
	});
}

async function auditBacklog(roadmap: RoadmapFile) {
	return (await priorityFor(roadmap)).backlog.audit;
}

function healthText(summary: { priorityHealth: { reasons: string[] } }): string {
	return summary.priorityHealth.reasons.join(' ');
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

	test('a blocked gate offers nothing, and health names the gate', async () => {
		const summary = await priorityFor({
			features: { 'audit-now': { milestone: 'v1.0' } },
			milestones,
		});

		expect(summary.backlog.audit).toMatchObject({ count: 2, readyCount: 0, top: [] });
		expect(summary.backlog.roadmapBlock).toBe('unmapped_features');
		expect(healthText(summary)).toContain('a record has no roadmap milestone');
	});

	test('an unreadable roadmap offers nothing, and health says so', async () => {
		const summary = await priorityFor('{ not json');

		expect(summary.backlog.audit).toMatchObject({ count: 2, readyCount: 0, top: [] });
		expect(summary.backlog.roadmapBlock).toBe('invalid_roadmap');
		expect(healthText(summary)).toContain('roadmap.json cannot be read');
	});

	test("a caller's roadmap is used instead of reading the file again", async () => {
		const known = roadmapSchema.parse({
			features: { 'audit-later': { milestone: 'v1.0' }, 'audit-now': { milestone: 'v1.1' } },
			milestones,
		});
		const summary = await priorityFor('{ not json', known);

		expect(summary.backlog.audit.top.map((item) => item.id)).toEqual(['audit-later']);
		expect(summary.backlog.roadmapBlock).toBeNull();
	});
});
