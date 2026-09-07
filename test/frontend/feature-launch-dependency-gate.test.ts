import type { Feature } from 'aidd-shared/metadata/features';

import { describe, expect, test } from 'bun:test';

import {
	dependenciesAreSatisfied,
	selectFeatureCandidates,
	unsatisfiedDependencies,
} from 'aidd-shared/metadata/features';

import {
	featureCanLaunchRun,
	featureLaunchBlockedTitle,
	featureLaunchGate,
} from '../../frontend/src/pages/projects/detail/featureLaunchEligibility.ts';

// One corpus exercising every shape the gate has to answer for: a prerequisite that is done, one
// that is not, one that resolves to nothing at all, and features with no prerequisites at all.
const CORPUS: Feature[] = [
	{ id: 'schema', passes: true, priority: 1, status: 'completed' },
	{ id: 'api', passes: false, priority: 1, status: 'in_progress' },
	{ dependencies: [], id: 'standalone', passes: false, priority: 2, status: 'backlog' },
	{ dependencies: ['schema'], id: 'satisfied', passes: false, priority: 2, status: 'backlog' },
	{ dependencies: ['api'], id: 'blocked', passes: false, priority: 2, status: 'backlog' },
	{
		dependencies: ['api', 'schema'],
		id: 'partly-blocked',
		passes: false,
		priority: 2,
		status: 'in_progress',
	},
	{ dependencies: ['ghost'], id: 'dangling', passes: false, priority: 3, status: 'backlog' },
];

function byId(id: string): Feature {
	const feature = CORPUS.find((candidate) => candidate.id === id);
	if (!feature) throw new Error(`no such feature: ${id}`);
	return feature;
}

describe('a launch control answers the question selection will actually be asked', () => {
	test('a feature behind an incomplete prerequisite cannot launch', () => {
		expect(featureCanLaunchRun(byId('blocked'), CORPUS)).toBeFalse();
		expect(featureCanLaunchRun(byId('partly-blocked'), CORPUS)).toBeFalse();
	});

	test('no prerequisites, or prerequisites that are done, stay launchable', () => {
		// Criterion 6: the change is a refusal added for one case, not a new obstacle for the rest.
		expect(featureCanLaunchRun(byId('standalone'), CORPUS)).toBeTrue();
		expect(featureCanLaunchRun(byId('satisfied'), CORPUS)).toBeTrue();
		expect(featureCanLaunchRun({ passes: false, status: 'backlog' }, [])).toBeTrue();
	});

	test('a dependency nothing resolves to counts as unsatisfied, not as absent', () => {
		// An incomplete inventory is the only other reading, and it is the dangerous one: it would
		// enable a control for a run that then declines to pick the feature up.
		const gate = featureLaunchGate(byId('dangling'), CORPUS);
		expect(gate.canLaunch).toBeFalse();
		expect(gate.blockedBy).toEqual(['ghost']);
	});

	test('the blocked node can name what it is waiting on', () => {
		// Criterion 4: a disabled control that will not say what it is waiting on reads as broken.
		const gate = featureLaunchGate(byId('partly-blocked'), CORPUS);
		expect(gate.blockedBy).toEqual(['api']);
		expect(featureLaunchBlockedTitle(gate.blockedBy)).toBe('Cannot launch: waiting on api');
	});

	test('the UI verdict matches selection for every feature selection would consider', () => {
		// Criterion 2, stated as the property rather than as "calls the shared function": for the
		// records selection is willing to look at, the two answers are the same one. A second
		// implementation of the dependency rule would have to reproduce this corpus exactly.
		const selectable = new Set(
			selectFeatureCandidates(CORPUS, { allFeatures: CORPUS, includeAudit: true }).map(
				(feature) => feature.id,
			),
		);
		for (const feature of CORPUS) {
			if (feature.status !== 'backlog' && feature.status !== 'in_progress') continue;
			expect({ [feature.id]: featureCanLaunchRun(feature, CORPUS) }).toEqual({
				[feature.id]: selectable.has(feature.id),
			});
		}
	});

	test('the yes/no rule and the reason are the same rule', () => {
		for (const feature of CORPUS) {
			expect(dependenciesAreSatisfied(feature, CORPUS)).toBe(
				unsatisfiedDependencies(feature, CORPUS).length === 0,
			);
		}
	});

	test('status still decides on its own where dependencies allow it', () => {
		expect(featureCanLaunchRun(byId('schema'), CORPUS)).toBeFalse();
		expect(
			featureCanLaunchRun({ id: 'x', passes: false, status: 'waiting_approval' }, CORPUS),
		).toBeFalse();
		// `passes: true` under a non-completed status is a metadata conflict, not a launch.
		expect(
			featureCanLaunchRun({ id: 'x', passes: true, status: 'backlog' }, CORPUS),
		).toBeFalse();
	});
});
