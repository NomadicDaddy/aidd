import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { overflowFlagsForMetrics } from '../../frontend/src/lib/observeOverflow.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function source(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendSource, ...segments)).text();
}

describe('bounded-region continuation cues', () => {
	test('tracks both axes until their relevant edge is reached', () => {
		const metrics = {
			clientHeight: 500,
			clientWidth: 800,
			scrollHeight: 1_400,
			scrollLeft: 0,
			scrollTop: 0,
			scrollWidth: 2_000,
		};

		expect(overflowFlagsForMetrics(metrics)).toEqual({
			end: true,
			scrollsDown: true,
			scrollsUp: false,
			start: false,
		});
		expect(overflowFlagsForMetrics({ ...metrics, scrollLeft: 1_200, scrollTop: 900 })).toEqual({
			end: false,
			scrollsDown: false,
			scrollsUp: true,
			start: true,
		});
		expect(
			overflowFlagsForMetrics({
				...metrics,
				scrollHeight: metrics.clientHeight,
				scrollWidth: metrics.clientWidth,
			}),
		).toEqual({ end: false, scrollsDown: false, scrollsUp: false, start: false });
	});

	test('routes every required bounded surface through the shared cue', async () => {
		const surfaces = await Promise.all([
			source('pages', 'projects', 'profileMatrix', 'ProfileMatrixTable.tsx'),
			source('pages', 'projects', 'detail', 'ReportsDesktopTable.tsx'),
			source('pages', 'projects', 'detail', 'dependencyGraphPanels.tsx'),
			source('pages', 'projects', 'ProjectsTableView.tsx'),
			source('pages', 'projects', 'detail', 'profile', 'ComputedProfilePanel.tsx'),
		]);
		const labels = [
			'Project profile matrix',
			'Project reports',
			'Dependency graph canvas',
			'Projects table',
			'Applicable audits',
		];

		for (const [index, text] of surfaces.entries()) {
			expect(text).toContain('<OverflowScroller');
			expect(text).toContain(`ariaLabel="${labels[index]}"`);
		}
	});

	test('keeps the projects catalog inside the measured viewport remainder', async () => {
		const [projects, fill] = await Promise.all([
			source('pages', 'projects', 'ProjectsTableView.tsx'),
			source('hooks', 'useViewportFill.ts'),
		]);

		expect(projects).toContain('useViewportFill<HTMLDivElement>');
		expect(projects).toContain('const PROJECTS_VIEWPORT_GUTTER_PX = 26;');
		expect(projects).toContain('gutterPx: PROJECTS_VIEWPORT_GUTTER_PX');
		expect(projects).toContain('ref={tableRef}');
		expect(projects).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(projects).not.toContain('max-h-[calc(100dvh-16rem)]');
		expect(fill).toContain("viewportFillScrollerClass = 'max-h-[var(--fill-height)]");
	});

	test('gives true overflow a keyboard target and a non-color-only edge shape', async () => {
		const [helper, scroller] = await Promise.all([
			source('lib', 'observeOverflow.ts'),
			source('components', 'shared', 'OverflowScroller.tsx'),
		]);

		expect(scroller).toContain('flags.scrollsUp');
		expect(scroller).toContain('scroller.tabIndex = 0');
		expect(scroller).toContain("scroller.removeAttribute('tabindex')");
		expect(scroller).toContain('group-data-[overflow-down=true]:opacity-100');
		expect(scroller).toContain('group-data-[overflow-up=true]:opacity-100');
		expect(scroller).toContain('border-l border-border');
		expect(scroller).toContain('border-r border-border');
		expect(scroller).toContain('border-b border-border');
		expect(helper).toContain('new MutationObserver(measure)');
		expect(helper).toContain('mutationObserver.observe(scroller');
	});

	test('keeps bounded profile cues in the viewport and clears pinned project identity', async () => {
		const [profile, projects, scroller] = await Promise.all([
			source('pages', 'projects', 'detail', 'profile', 'ComputedProfilePanel.tsx'),
			source('pages', 'projects', 'ProjectsTableView.tsx'),
			source('components', 'shared', 'OverflowScroller.tsx'),
		]);
		expect(profile).toContain('rootRef={auditsScrollerRef}');
		expect(profile).toContain('@min-[40rem]/audits:grid-cols-2');
		expect(projects).toContain('[--projects-table-cue-inset:0px]');
		expect(projects).toContain('sm:[--projects-table-cue-inset:44ch]');
		expect(projects).toContain('startCueInset="var(--projects-table-cue-inset)"');
		expect(scroller).toContain('style={{ left: startCueInset }}');
	});
});
