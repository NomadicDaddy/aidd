import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { describe, expect, test } from 'bun:test';

import {
	withRoadmapMilestone,
	withRoadmapMilestones,
} from '../../backend/src/services/project/listings/featureMappers.ts';

// A project-detail response carrying every feature in full is, for this repository, 2.07 MB of
// `features` inside a 2.23 MB response, 83% of it prose that no tab reads in bulk.
// The list projection drops the prose; the single-feature read keeps it. These tests hold that
// split in place, because losing either half is silent — the page still renders, it just ships a
// megabyte again, or the details dialog quietly goes blank.

const PROSE = {
	affectedFiles: ['backend/src/services/project/listings/featureMappers.ts'],
	aiddReport: { source: 'aidd-web-report' },
	notes: ['A note long enough to matter when multiplied by three hundred features.'],
	spec: '1. Acceptance criteria.\n2. More acceptance criteria.',
};

const FEATURE: Feature = {
	description: 'Why the feature exists, which the Features tab filters over client-side.',
	directory: 'remediation-20260806-project-detail-payload',
	id: 'remediation-20260806-project-detail-payload',
	status: 'backlog',
	summary: 'One-line statement of the same thing.',
	title: 'Project detail endpoint returns the whole feature backlog',
	...PROSE,
} as Feature;

const ROADMAP: Roadmap = {
	features: { 'remediation-20260806-project-detail-payload': { milestone: 'v2.0' } },
	milestones: { 'v2.0': { priority: 2 } },
};

function listOne(roadmap: Roadmap | undefined): Record<string, unknown> {
	const [listed] = withRoadmapMilestones([FEATURE], roadmap);
	if (!listed) throw new Error('the projection dropped the feature entirely');
	return listed as unknown as Record<string, unknown>;
}

describe('project detail feature projection', () => {
	test('the list projection omits every prose field', () => {
		const listed = listOne(ROADMAP);
		for (const field of Object.keys(PROSE)) {
			expect(listed).not.toHaveProperty(field);
		}
	});

	test('the list projection keeps the fields the Features tab filters and renders', () => {
		const listed = listOne(ROADMAP);
		// `description` and `summary` are the search fields. Dropping them would move the tab's
		// client-side filter to the server as the price of the payload, which is a different change.
		expect(listed.description).toBe(FEATURE.description);
		expect(listed.summary).toBe(FEATURE.summary);
		expect(listed.title).toBe(FEATURE.title);
		expect(listed.status).toBe('backlog');
		expect(listed.milestone).toBe('v2.0');
	});

	test('the single-feature projection keeps the prose the list dropped', () => {
		const full = withRoadmapMilestone(FEATURE, ROADMAP);
		expect(full.spec).toBe(PROSE.spec);
		expect(full.notes).toEqual(PROSE.notes);
		expect(full.affectedFiles).toEqual(PROSE.affectedFiles);
		expect(full.aiddReport).toEqual(PROSE.aiddReport);
		// Same milestone stamp as a list row, so the dialog can merge one over the other.
		expect(full.milestone).toBe('v2.0');
	});

	test('deleting the prose does not mutate the feature the caller passed in', () => {
		const feature = { ...FEATURE };
		withRoadmapMilestones([feature], ROADMAP);
		expect(feature.spec).toBe(PROSE.spec);
		expect(feature.notes).toEqual(PROSE.notes);
	});

	test('a feature with no roadmap entry lists with a null milestone rather than dropping out', () => {
		const listed = listOne(undefined);
		expect(listed.milestone).toBeNull();
		expect(listed.id).toBe(FEATURE.id);
	});
});
