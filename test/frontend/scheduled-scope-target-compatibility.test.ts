import type { ScheduledTaskProjectScope } from 'aidd-shared/contracts/scheduled-tasks';

import { describe, expect, test } from 'bun:test';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';
import type { ScheduledSaveTarget } from '../../frontend/src/pages/scheduled/scheduledSaveReadiness.ts';

import {
	scheduledSaveReadiness,
	scopeTargetIssue,
} from '../../frontend/src/pages/scheduled/scheduledSaveReadiness.ts';
import { findTargetRecipe } from '../../frontend/src/pages/scheduled/scheduledTargetRecipe.ts';

const SCOPES: ScheduledTaskProjectScope[] = ['all', 'explicit', 'none'];

const TARGETS: { label: string; target: ScheduledSaveTarget }[] = [
	{ label: 'director', target: { type: 'director' } },
	{ label: 'audit', target: { type: 'audit' } },
	{ label: 'skill', target: { type: 'skill' } },
	{ label: 'metadata-only recipe', target: { metadataOnly: true, type: 'recipe' } },
	{ label: 'ordinary recipe', target: { metadataOnly: false, type: 'recipe' } },
	{ label: 'directive', target: { prompt: 'Summarize the findings.', type: 'directive' } },
];

/** Exactly the combinations `assertScopeSupportsTarget` throws on, and nothing else. */
const REFUSED = new Set([
	'audit/none',
	'directive/none',
	'director/all',
	'director/explicit',
	'metadata-only recipe/none',
]);

function readiness(projectScope: ScheduledTaskProjectScope, target: ScheduledSaveTarget) {
	return scheduledSaveReadiness({
		applyChanges: false,
		confirmed: false,
		issue: null,
		name: 'Nightly sweep',
		pending: false,
		// Held false so the cross product measures the scope rule rather than the picker's
		// own complaint about an explicit scope with nothing selected.
		projectSelectionMissing: false,
		projectScope,
		system: target.type === 'director',
		target,
		targetId: target.type === 'director' ? '' : 'hygiene',
	});
}

function recipe(id: string, metadataOnly?: boolean): RecipeDefinition {
	return {
		id,
		name: id,
		parameters: [],
		steps: [],
		...(metadataOnly === undefined ? {} : { metadataOnly }),
	};
}

describe('scheduled scope/target compatibility', () => {
	test('blocks every combination the server refuses, and only those', () => {
		for (const scope of SCOPES) {
			for (const { label, target } of TARGETS) {
				const key = `${label}/${scope}`;
				const { blocked, reason } = readiness(scope, target);

				expect({ blocked, key }).toEqual({ blocked: REFUSED.has(key), key });
				if (REFUSED.has(key)) expect(reason).toBeTruthy();
			}
		}
	});

	test('states the refusal in the same words the server states it', async () => {
		// Read from the server rather than restating its sentences here: a test carrying its own
		// third copy of the wording would pass while the two implementations drifted apart.
		const validator = await Bun.file('backend/src/services/scheduled/validator.ts').text();
		const messages = [
			scopeTargetIssue('all', { type: 'director' }),
			scopeTargetIssue('none', { type: 'audit' }),
			scopeTargetIssue('none', { metadataOnly: true, type: 'recipe' }),
			scopeTargetIssue('none', { prompt: 'Summarize the findings.', type: 'directive' }),
		];

		expect(messages.filter((message) => message !== null)).toHaveLength(4);
		for (const message of messages) {
			expect(validator).toContain(`'${message}'`);
		}
	});

	test('leaves the server-side refusal in place', async () => {
		const validator = await Bun.file('backend/src/services/scheduled/validator.ts').text();
		const method = validator.slice(
			validator.indexOf('private async assertScopeSupportsTarget'),
		);
		// The first close-brace at method indentation ends the guard; nested blocks close deeper.
		const guard = method.slice(0, method.indexOf('\n\t}\n') + 3);

		expect(validator).toContain(
			'await this.assertScopeSupportsTarget(projectScope, input.target)',
		);
		expect(guard.split('throw new HttpError(').length - 1).toBe(4);
		expect(guard).toContain('if (recipe.metadataOnly === true)');
	});

	test('reads metadataOnly off the resolved recipe rather than a list of ids', () => {
		const catalog = [recipe('docs-refresh'), recipe('feature-audit', true)];

		expect(findTargetRecipe(catalog, 'recipe', 'feature-audit')?.metadataOnly).toBe(true);
		expect(findTargetRecipe(catalog, 'recipe', 'docs-refresh')?.metadataOnly).toBeUndefined();
		// A recipe id that is not in the catalog, and a target that is not a recipe at all, both
		// resolve to nothing — so neither can be reported as metadata-only on a guess.
		expect(findTargetRecipe(catalog, 'recipe', 'renamed-since')).toBeUndefined();
		expect(findTargetRecipe(catalog, 'skill', 'feature-audit')).toBeUndefined();
	});

	test('the form derives the target from the catalog entry it resolved', async () => {
		const form = await Bun.file('frontend/src/pages/scheduled/ScheduledTaskForm.tsx').text();

		expect(form).toContain('const targetRecipe = useTargetRecipe(targetType, targetId);');
		expect(form).toContain('metadataOnly: targetRecipe?.metadataOnly === true');
		// A built-in task hides the target fields, so its draft target type is whatever the preset
		// left behind; the gate has to know it is judging a Director cycle.
		expect(form).toContain("? { type: 'director' }");
	});

	test('keeps every other blocker it already reported', () => {
		const base = {
			applyChanges: false,
			confirmed: false,
			issue: null,
			name: 'Nightly sweep',
			pending: false,
			projectSelectionMissing: false,
			projectScope: 'all' as ScheduledTaskProjectScope,
			system: false,
			target: { type: 'skill' } as ScheduledSaveTarget,
			targetId: 'hygiene',
		};

		expect(scheduledSaveReadiness({ ...base, targetId: '' }).reason).toBe('Choose a target.');
		// A directive is gated on its prompt instead: it never names a catalog entry, so an empty
		// target id must not read as an unmade choice.
		expect(
			scheduledSaveReadiness({
				...base,
				target: { prompt: '   ', type: 'directive' },
				targetId: '',
			}).reason,
		).toBe('Enter the directive to run.');
		expect(
			scheduledSaveReadiness({
				...base,
				target: { prompt: 'Summarize the findings.', type: 'directive' },
				targetId: '',
			}),
		).toEqual({ blocked: false, reason: null });
		expect(
			scheduledSaveReadiness({
				...base,
				projectScope: 'explicit',
				projectSelectionMissing: true,
			}).reason,
		).toBe('Select at least one project.');
		expect(scheduledSaveReadiness({ ...base, applyChanges: true }).reason).toBe(
			'Confirm the unattended-change consent above.',
		);
		expect(scheduledSaveReadiness({ ...base, name: '' }).reason).toBe('Enter a task name.');
		expect(
			scheduledSaveReadiness({ ...base, issue: { field: 'cron', message: 'Fix the cron.' } })
				.reason,
		).toBe('Fix the cron.');
		expect(scheduledSaveReadiness(base)).toEqual({ blocked: false, reason: null });
	});
});
