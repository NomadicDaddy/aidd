import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	VIEWPORT_FILL_RELEASED,
	viewportFillHeightValue,
} from '../../frontend/src/hooks/useViewportFill.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');
const source = (path: string) => readFile(resolve(FRONTEND_SRC, path), 'utf8');

const VIEWPORT_FILL_CALLSITES = [
	'pages/audits/tabs/ApplicabilityTab.tsx',
	'pages/audits/tabs/OverridesList.tsx',
	'pages/projects/ProjectsTableView.tsx',
	'pages/projects/detail/ActiveRunsPanel.tsx',
	'pages/projects/detail/AuditsDesktopTable.tsx',
	'pages/projects/detail/AuditsMobileList.tsx',
	'pages/projects/detail/CodeTab.tsx',
	'pages/projects/detail/FeaturesDesktopTable.tsx',
	'pages/projects/detail/NotesTab.tsx',
	'pages/projects/detail/ReportsDesktopTable.tsx',
	'pages/projects/detail/dependencyGraphPanels.tsx',
	'pages/projects/detail/profile/ComputedProfilePanel.tsx',
	'pages/projects/detail/workingTree/WorkingTreeTable.tsx',
	'pages/projects/profileMatrix/ProfileMatrixTable.tsx',
	'pages/recipes/RecipeGrid.tsx',
	'pages/runs/RunsPage.tsx',
	'pages/skills/SkillsPage.tsx',
] as const;

describe('viewport-fill floor', () => {
	test('releases the cap rather than inventing one when the remainder disappears', () => {
		// Page flow is an explicit consumer choice. It is never inferred from a too-small
		// remainder, because that removed the dependency canvas pan affordance.
		expect(VIEWPORT_FILL_RELEASED).toBe('max-content');
		expect(viewportFillHeightValue(-100, { belowFoldAvailablePx: 828, pageFlow: true })).toBe(
			VIEWPORT_FILL_RELEASED,
		);
		expect(viewportFillHeightValue(294, { belowFoldAvailablePx: 828, pageFlow: true })).toBe(
			VIEWPORT_FILL_RELEASED,
		);
	});

	test('keeps a measured or viewport-derived scrollport above its named floor', () => {
		expect(viewportFillHeightValue(239, { belowFoldAvailablePx: 828 })).toBe('240px');
		expect(viewportFillHeightValue(640, { belowFoldAvailablePx: 828 })).toBe('640px');
		expect(viewportFillHeightValue(640.4, { belowFoldAvailablePx: 828 })).toBe('640px');
		expect(viewportFillHeightValue(159, { belowFoldAvailablePx: 828, floor: 'compact' })).toBe(
			'160px',
		);
		expect(viewportFillHeightValue(296, { belowFoldAvailablePx: 884, floor: 'graph' })).toBe(
			'320px',
		);
		expect(viewportFillHeightValue(-100, { belowFoldAvailablePx: 828, floor: 'graph' })).toBe(
			'828px',
		);
		expect(viewportFillHeightValue(-100, { belowFoldAvailablePx: 200, floor: 'graph' })).toBe(
			'320px',
		);
	});

	test('is the only writer of the fill property', async () => {
		const hook = await source('hooks/useViewportFill.ts');

		// A consumer that writes its own `--fill-height` bypasses the release branch entirely and
		// reintroduces the keyhole on exactly the surface it was written for.
		expect(hook).toContain('viewportFillHeightValue(available, {');
		const consumers = await Promise.all(VIEWPORT_FILL_CALLSITES.map(source));
		for (const consumer of consumers) {
			expect(consumer).not.toContain("--fill-height'");
		}
	});

	test('removes the zero-height escape hatch from every consumer', async () => {
		const consumers = await Promise.all(VIEWPORT_FILL_CALLSITES.map(source));

		for (const consumer of consumers) {
			expect(consumer).toContain('useViewportFill<');
			expect(consumer).not.toContain('minHeightPx');
		}
	});

	test('protects all five S15 verification surfaces with the shared floor', async () => {
		const [applicability, catalog, projectAudits, projectCode, projectDependencies] =
			await Promise.all([
				source('pages/audits/tabs/ApplicabilityTab.tsx'),
				source('pages/audits/tabs/CatalogTable.tsx'),
				source('pages/projects/detail/AuditsDesktopTable.tsx'),
				source('pages/projects/detail/CodeTab.tsx'),
				source('pages/projects/detail/dependencyGraphPanels.tsx'),
			]);

		for (const surface of [applicability, projectAudits, projectCode]) {
			expect(surface).toContain('useViewportFill<HTMLDivElement>');
			expect(surface).not.toContain('minHeightPx');
		}
		expect(catalog).not.toContain('useViewportFill<HTMLDivElement>');
		expect(projectDependencies).toContain("floor: 'graph'");
		expect(projectDependencies).toContain('scrollerClassName={viewportFillScrollerClass}');
	});

	test('makes phone page flow explicit only on the two natural-height inventories', async () => {
		const [projects, projectAudits, projectDependencies] = await Promise.all([
			source('pages/projects/ProjectsTableView.tsx'),
			source('pages/projects/detail/AuditsMobileList.tsx'),
			source('pages/projects/detail/dependencyGraphPanels.tsx'),
		]);

		expect(projects).toContain("mode: 'page-on-phone'");
		expect(projectAudits).toContain("mode: 'page-on-phone'");
		expect(projectAudits).toContain('viewportFillPhonePageListClass');
		expect(projectAudits).toContain('viewportFillPhonePageRootClass');
		expect(projectDependencies).not.toContain("mode: 'page-on-phone'");
	});
});
