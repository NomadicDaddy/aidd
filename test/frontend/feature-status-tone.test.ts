import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { statusTone } from '../../frontend/src/pages/projects/detail/shared.ts';

function renderFeatureActions(status: string): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FeatureActions } from './src/pages/projects/detail/FeatureRowControls.tsx';",
		`const status = ${JSON.stringify(status)};`,
		"const feature = { id: 'feature-one', status, title: 'Feature one' };",
		'const noop = () => undefined;',
		'const actions = createElement(FeatureActions, {',
		"decision: 'Ship the narrow contract', disabled: false, feature, launching: false,",
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

	test('renders the waiting-approval action contract', () => {
		const html = renderFeatureActions('waiting_approval');

		expect(html).toContain('aria-label="Delete feature-one"');
		expect(html).toContain('aria-label="Approve feature-one"');
		expect(html).toContain('aria-label="Decision for feature-one"');
		expect(html).toContain('aria-label="Approve feature-one with decision"');
		expect(html).not.toContain('aria-label="Launch coding run for feature-one"');
	});

	test('renders a canonical status recovery control for an invalid persisted status', () => {
		const html = renderFeatureActions('pending');

		expect(html).toContain('aria-label="Status for feature-one"');
		expect(html).toContain('value="pending"');
		expect(html).toContain('Pending (invalid)');
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
