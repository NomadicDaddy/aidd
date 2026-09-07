import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { ProjectMilestonesView } from '../../frontend/src/api/types.ts';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

function view(
	violations: { featureDirectory: string; featurePasses: boolean }[],
	unmappedFeatureDirectories: string[] = [],
): ProjectMilestonesView {
	return {
		activeMilestone: 'v3.0',
		gateBlocked: unmappedFeatureDirectories.length > 0,
		lifecycle: 'active',
		milestones: [
			{
				completed: 1,
				description: null,
				featureDirectories: ['a'],
				name: 'v2.0',
				priority: 1,
				total: 1,
			},
			{
				completed: 0,
				description: null,
				featureDirectories: ['b'],
				name: 'v3.0',
				priority: 2,
				total: 1,
			},
		],
		unmappedFeatureDirectories,
		violations: violations.map((entry) => ({
			dependency: 'later-work',
			dependencyMilestone: 'v3.0',
			featureDirectory: entry.featureDirectory,
			featurePasses: entry.featurePasses,
			milestone: 'v2.0',
		})),
	};
}

function renderCallout(views: ProjectMilestonesView[]): string[] {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MilestonesGateCallout } from './src/pages/projects/detail/MilestonesGateCallout.tsx';",
		`const views = ${JSON.stringify(views)};`,
		'console.log(JSON.stringify(views.map((view) => ' +
			'renderToStaticMarkup(createElement(MilestonesGateCallout, { view })))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string[];
}

describe('milestones gate callout severity', () => {
	test('does not call a violation on a completed feature blocking', () => {
		// The reported defect: two completed v2.0 features depending on v3.0 work rendered
		// "2 blocking" while the live gate reported `gateBlocked: false`. Nothing was blocked and
		// no work was stranded -- the ordering was only wrong on paper.
		const [markup = ''] = renderCallout([
			view([
				{ featureDirectory: 'coordinator-auto-cycle-scheduling', featurePasses: true },
				{ featureDirectory: 'devdiary-boundary-day-amendment', featurePasses: true },
			]),
		]);

		expect(markup).not.toContain('blocking');
		expect(markup).toContain('2 out of order');
		expect(markup).toContain('already completed');
		// Amber, not red: attention without claiming the gate is shut.
		expect(markup).toContain('text-amber-800');
		expect(markup).not.toContain('text-red-700');
	});

	test('keeps a violation on an unfinished feature red and names it unreachable', () => {
		const [markup = ''] = renderCallout([
			view([{ featureDirectory: 'still-open', featurePasses: false }]),
		]);

		expect(markup).toContain('1 unreachable');
		expect(markup).toContain('cannot be selected at all');
		expect(markup).toContain('text-red-700');
	});

	test('counts the two kinds separately rather than summing them', () => {
		// Summing is what produced the misleading label: an unmapped directory shuts the gate
		// project-wide, a violation never does, so one number cannot describe both.
		const [markup = ''] = renderCallout([
			view(
				[
					{ featureDirectory: 'shipped', featurePasses: true },
					{ featureDirectory: 'open', featurePasses: false },
				],
				['orphan'],
			),
		]);

		expect(markup).toContain('1 blocking');
		expect(markup).toContain('1 unreachable');
		expect(markup).toContain('1 out of order');
		expect(markup).not.toContain('3 blocking');
	});

	test('renders nothing when the roadmap is sound', () => {
		expect(renderCallout([view([])])).toEqual(['']);
	});
});
