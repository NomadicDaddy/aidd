import { describe, expect, test } from 'bun:test';

import {
	isReadOnlySkillDirectiveViolation,
	skillDirectiveExecutionIntent,
} from '../../frontend/src/pages/runs/skillDirectiveIntent.ts';

const readOnlySkillDirective = {
	launchCommand: {
		args: ['--directive', '--skill', '12-factor-guidelines', '--directive-readonly'],
		display: 'aidd --directive --skill 12-factor-guidelines --directive-readonly',
		source: 'exact' as const,
	},
	mode: 'directive' as const,
};

describe('skill directive intent', () => {
	test('labels a read-only skill directive without pretending it is an audit', () => {
		expect(
			skillDirectiveExecutionIntent({
				launchCommand: {
					args: [
						'--directive',
						'--skill',
						'12-factor-guidelines',
						'--directive-readonly',
					],
					display: 'aidd --directive --skill 12-factor-guidelines --directive-readonly',
					source: 'exact',
				},
				mode: 'directive',
			})
		).toBe('review-only');
	});

	test('labels an apply-capable skill directive as changes allowed', () => {
		expect(
			skillDirectiveExecutionIntent({
				launchCommand: {
					args: ['--directive', '--skill', 'document-changes'],
					display: 'aidd --directive --skill document-changes',
					source: 'exact',
				},
				mode: 'directive',
			})
		).toBe('apply-changes');
	});

	test('classifies changed files and commits as read-only contract violations', () => {
		expect(
			isReadOnlySkillDirectiveViolation(readOnlySkillDirective, {
				commitsCreatedCount: 0,
				filesCreated: 1,
				filesEdited: 0,
			})
		).toBe(true);
		expect(
			isReadOnlySkillDirectiveViolation(readOnlySkillDirective, {
				commitsCreatedCount: 1,
				filesCreated: 0,
				filesEdited: 0,
			})
		).toBe(true);
	});

	test('does not classify evidence-free review-only or apply-changes directives as violations', () => {
		expect(
			isReadOnlySkillDirectiveViolation(readOnlySkillDirective, {
				commitsCreatedCount: 0,
				filesCreated: 0,
				filesEdited: 0,
			})
		).toBe(false);
		expect(
			isReadOnlySkillDirectiveViolation(
				{
					launchCommand: {
						args: ['--directive', '--skill', 'document-changes'],
						display: 'aidd --directive --skill document-changes',
						source: 'exact',
					},
					mode: 'directive',
				},
				{
					commitsCreatedCount: 1,
					filesCreated: 1,
					filesEdited: 1,
				}
			)
		).toBe(false);
	});
});
