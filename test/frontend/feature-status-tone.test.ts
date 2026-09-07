import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { featureCanLaunchRun } from '../../frontend/src/pages/projects/detail/featureLaunchEligibility.ts';
import { statusTone } from '../../frontend/src/pages/projects/detail/shared.ts';

function renderFeatureActions(status: string, passes = false): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FeatureActions } from './src/pages/projects/detail/FeatureRowControls.tsx';",
		`const status = ${JSON.stringify(status)};`,
		`const feature = { id: 'feature-one', passes: ${passes}, status, title: 'Feature one' };`,
		'const noop = () => undefined;',
		'const actions = createElement(FeatureActions, {',
		"decision: 'Ship the narrow contract', disabled: false, feature, inventory: [feature],",
		'launching: false,',
		'onApprove: noop, onDecisionChange: noop, onDelete: noop, onLaunchRun: noop,',
		'onSelect: noop, onStatusChange: noop, runActive: false, status,',
		'});',
		'console.log(renderToStaticMarkup(actions));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('statusTone', () => {
	test('maps each canonical feature status to its tone', () => {
		expect(statusTone('completed')).toBe('emerald');
		expect(statusTone('in_progress')).toBe('teal');
		expect(statusTone('waiting_approval')).toBe('amber');
		expect(statusTone('backlog')).toBe('neutral');
	});

	test('keeps the missing-status placeholder neutral', () => {
		expect(statusTone('unknown')).toBe('neutral');
	});

	test('renders non-canonical statuses as invalid (red), never as completed', () => {
		// 'completed' is the only completion status — strays must not alias to it.
		expect(statusTone('done')).toBe('red');
		expect(statusTone('verified')).toBe('red');
		expect(statusTone('in-progress')).toBe('red');
		expect(statusTone('waiting-approval')).toBe('red');
	});
});

describe('FeatureActions status variants', () => {
	test('shares launch eligibility across project-detail feature surfaces', () => {
		expect(featureCanLaunchRun({ passes: false, status: 'backlog' }, [])).toBeTrue();
		expect(featureCanLaunchRun({ passes: false, status: 'in_progress' }, [])).toBeTrue();
		expect(featureCanLaunchRun({ passes: true, status: 'completed' }, [])).toBeFalse();
		expect(featureCanLaunchRun({ passes: true, status: 'in_progress' }, [])).toBeFalse();
		expect(featureCanLaunchRun({ passes: false, status: 'waiting_approval' }, [])).toBeFalse();
	});

	test('renders the backlog action contract', () => {
		const html = renderFeatureActions('backlog');

		expect(html).toContain('aria-label="Status for feature-one"');
		expect(html).toContain('aria-label="Launch coding run for feature-one"');
		expect(html).toContain('aria-label="Delete feature-one"');
		expect(html).not.toContain('aria-label="Approve feature-one"');
	});

	test('renders the in-progress action contract', () => {
		const html = renderFeatureActions('in_progress');

		expect(html).toContain('aria-label="View details for feature-one"');
		expect(html).toContain('aria-label="Launch coding run for feature-one"');
		expect(html).not.toContain('aria-label="Status for feature-one"');
		expect(html).not.toContain('aria-label="Delete feature-one"');
	});

	test('disables launch when an open feature is incorrectly flagged as passing', () => {
		const html = renderFeatureActions('in_progress', true);

		expect(html).toContain('aria-label="Launch coding run for feature-one"');
		expect(html).toContain('disabled=""');
		expect(html).toMatch(/<span[^>]*tabindex="0"[^>]*><button/u);
		expect(html).not.toContain(
			'title="Cannot launch: passes is true while status is not completed"',
		);
	});

	test('renders the waiting-approval action contract', () => {
		const html = renderFeatureActions('waiting_approval');

		expect(html).toContain('aria-label="Delete feature-one"');
		expect(html).toContain('aria-label="Approve feature-one"');
		expect(html).toContain('aria-label="Decision for feature-one"');
		expect(html).toContain('aria-label="Approve feature-one with decision"');
		// Every affirmative action in this row is secondary, so the row renders no filled plate
		// at all. Approve is repeated once per waiting-approval feature, and a queue of solid
		// plates leads with nothing. Asserted from both sides, because the absence alone would
		// also be satisfied by a variant that stopped resolving and emitted no class. The count
		// token is unique to secondary and appears once in its class string, so it counts the
		// three affirmative buttons: Details, Approve, and Approve with decision. Delete is the
		// row's ghost and the decision field is an Input, so neither is counted here.
		expect(html).not.toMatch(/\sbg-accent(?=\s)/u);
		expect(html.split('hover:border-accent/50').length - 1).toBe(3);
		expect(html).not.toContain('aria-label="Launch coding run for feature-one"');
	});

	test('renders a canonical status recovery control for a failed persisted status', () => {
		const html = renderFeatureActions('failed');

		expect(html).toContain('aria-label="Status for feature-one"');
		expect(html).toContain('value="failed"');
		expect(html).toContain('Failed (invalid)');
		expect(html).toContain('<option value="completed">Completed</option>');
		expect(html).not.toContain('aria-label="Launch coding run for feature-one"');
		expect(html).not.toContain('aria-label="Delete feature-one"');
	});

	test('renders other statuses as read-only actions', () => {
		const html = renderFeatureActions('completed');

		expect(html).toContain('class="flex min-w-0 flex-wrap items-center gap-2"');
		expect(html).toContain('aria-label="View details for feature-one"');
		expect(html).not.toContain('aria-label="Launch coding run for feature-one"');
		expect(html).not.toContain('aria-label="Delete feature-one"');
		expect(html).not.toContain('aria-label="Approve feature-one"');
	});
});
