import { describe, expect, test } from 'bun:test';

import type { MaturityStage } from '../../frontend/src/api/types.ts';

import { defaultExpandedMaturityStageIds } from '../../frontend/src/pages/projects/detail/maturityExpansion.ts';

function stage(id: MaturityStage['id'], status: MaturityStage['status']): MaturityStage {
	return {
		artifacts: [],
		complete: status === 'complete' ? 1 : 0,
		description: `${id} stage`,
		id,
		label: id,
		order: 1,
		required: 1,
		status,
	};
}

describe('defaultExpandedMaturityStageIds', () => {
	test('keeps incomplete maturity stages collapsed until the operator opens one', () => {
		const expanded = defaultExpandedMaturityStageIds([
			stage('specified', 'complete'),
			stage('structured', 'partial'),
			stage('mapped', 'empty'),
		]);

		expect([...expanded]).toEqual([]);
	});

	test('keeps every maturity stage collapsed when all stages are complete', () => {
		const expanded = defaultExpandedMaturityStageIds([
			stage('specified', 'complete'),
			stage('structured', 'complete'),
			stage('mapped', 'complete'),
			stage('planned', 'complete'),
			stage('engaged', 'complete'),
			stage('audited', 'complete'),
		]);

		expect([...expanded]).toEqual([]);
	});

	test('keeps an empty stage list collapsed', () => {
		expect([...defaultExpandedMaturityStageIds([])]).toEqual([]);
	});
});
