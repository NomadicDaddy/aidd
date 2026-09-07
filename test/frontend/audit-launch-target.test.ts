import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	launchTargetControlModel,
	mergeLaunchTargetValue,
} from '../../frontend/src/components/shared/launchTargetControlModel.ts';
import { buildAuditLaunchRequest } from '../../frontend/src/pages/audits/auditLaunchRequest.ts';

const resolvedDefaults = {
	defaultBackend: 'codex' as const,
	defaultModel: 'audit-model',
	defaultProvider: undefined,
	defaultReasoningEffort: 'high',
	isLoading: false,
	modelSource: 'mode-config',
	projectConfigApplied: true,
	role: undefined,
};

describe('audit launch requests', () => {
	test('threads explicit run overrides and trims text values', () => {
		expect(
			buildAuditLaunchRequest({
				auditAll: false,
				auditNames: ['SECURITY'],
				launchTarget: {
					backend: 'codex',
					model: ' audit-override ',
					reasoningEffort: ' high ',
				},
				projectIds: ['aidd'],
				review: false,
			}),
		).toEqual({
			auditAll: false,
			auditNames: ['SECURITY'],
			backend: 'codex',
			model: 'audit-override',
			projectIds: ['aidd'],
			reasoningEffort: 'high',
			review: false,
		});
	});

	test('keeps run-all scope and review targets distinct while omitting blank overrides', () => {
		const runAll = buildAuditLaunchRequest({
			auditAll: true,
			auditNames: ['SECURITY'],
			launchTarget: { model: ' ', reasoningEffort: '' },
			projectIds: ['aidd', 'spernakit'],
			review: false,
		});
		const review = buildAuditLaunchRequest({
			auditAll: false,
			auditNames: ['SECURITY'],
			launchTarget: { model: 'review-model' },
			projectIds: ['aidd'],
			review: true,
		});

		expect(runAll).toEqual({
			auditAll: true,
			auditNames: [],
			projectIds: ['aidd', 'spernakit'],
			review: false,
		});
		expect(review.model).toBe('review-model');
		expect(review.review).toBe(true);
		expect('backend' in review).toBe(false);
	});
});

describe('audit launch-target presentation', () => {
	test('shows the resolved identity for one selected project', () => {
		const model = launchTargetControlModel({
			...resolvedDefaults,
			defaultScope: 'resolved',
			value: {},
		});

		expect(model.shownBackend).toBe('codex');
		expect(model.shownModel).toBe('audit-model');
		expect(model.shownReasoningEffort).toBe('high');
		expect(model.provenance).toContain('project config applied');
	});

	test('does not invent one identity for several projects', () => {
		const model = launchTargetControlModel({
			...resolvedDefaults,
			defaultScope: 'per-project',
			value: {},
		});

		expect(model.summaryText).toBe('Per-project defaults');
		expect(model.shownBackend).toBeUndefined();
		expect(model.shownModel).toBeUndefined();
		expect(model.shownReasoningEffort).toBeUndefined();
		expect(model.provenance).toContain('Each selected project resolves');
	});

	test('shows only explicit values when a multi-project override is partial', () => {
		const model = launchTargetControlModel({
			...resolvedDefaults,
			defaultScope: 'per-project',
			value: { model: 'override-model' },
		});

		expect(model.custom).toBe(true);
		expect(model.shownBackend).toBeUndefined();
		expect(model.shownModel).toBe('override-model');
		expect(model.shownReasoningEffort).toBeUndefined();
		expect(model.backendDefaultLabel).toBe('Default (per project)');
		expect(model.modelPlaceholder).toBe('Per-project default');
		expect(model.provenance).toContain('unset fields resolve per project');
	});

	test('normalizes cleared fields and supports a full reset', () => {
		const current = { backend: 'codex' as const, model: 'override-model' };
		expect(mergeLaunchTargetValue(current, { model: '' })).toEqual({ backend: 'codex' });
		expect(mergeLaunchTargetValue(current, { backend: undefined, model: '' })).toEqual({});
	});

	test('wires distinct audit and directive controls into the catalog toolbar', async () => {
		const source = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/audits/tabs/CatalogToolbar.tsx'),
			'utf8',
		);

		expect(source).toContain('label="Run"');
		expect(source).toContain('mode="audit"');
		expect(source).toContain('label="Review"');
		expect(source).toContain('mode="directive"');
		expect(source).toContain('onRun(false, undefined, runTarget)');
		expect(source).toContain('onRun(true, undefined, reviewTarget)');
	});
});
