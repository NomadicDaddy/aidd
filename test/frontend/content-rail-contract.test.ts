import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { PageContentType } from '../../frontend/src/lib/contentRails.ts';

import { contentRailClass, pageRailByContentType } from '../../frontend/src/lib/contentRails.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function source(relativePath: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src', relativePath)).text();
}

/**
 * Every page composition, keyed by the content type it declares — never by the width tier that type
 * resolves to. A page naming a tier directly is making the guess `contentRails.ts` exists to remove,
 * and the guess stays invisible until someone measures the screen: docs and the pipeline session
 * report both sat on `bounded` while their own internal arithmetic was written for the reading rail.
 */
const pageCompositions = {
	'pages/about/AboutPage.tsx': 'reading',
	'pages/audits/AuditsPage.tsx': 'catalog',
	'pages/dashboard/DashboardPage.tsx': 'data',
	'pages/diary/DiaryPage.tsx': 'data',
	'pages/director/DirectorPage.tsx': 'data',
	'pages/docs/DocsNotFound.tsx': 'reading',
	'pages/docs/DocsPage.tsx': 'reading',
	'pages/notFound/NotFoundPage.tsx': 'reading',
	'pages/pipelineSessions/PipelineSessionReportPage.tsx': 'reading',
	'pages/projects/ProjectDetailPage.tsx': 'data',
	'pages/projects/ProjectsPage.tsx': 'catalog',
	'pages/projects/profileMatrix/ProfileMatrixPage.tsx': 'data',
	'pages/recipes/RecipesPage.tsx': 'catalog',
	'pages/recipes/detail/RecipeEditMode.tsx': 'workflow',
	'pages/recipes/detail/RecipeNotFound.tsx': 'reading',
	'pages/recipes/detail/RecipeOverviewMode.tsx': 'catalog',
	'pages/runs/RunsPage.tsx': 'data',
	'pages/scheduled/ScheduledPage.tsx': 'catalog',
	'pages/settings/ExecutionIdentityBadgeLabPage.tsx': 'catalog',
	'pages/settings/SettingsPage.tsx': 'workflow',
	'pages/skills/SkillsPage.tsx': 'catalog',
	'pages/telemetry/TelemetryPage.tsx': 'data',
} as const satisfies Record<string, PageContentType>;

function renderPageHeader(): Record<string, string> {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { PageHeader } from './src/components/shared/PageHeader.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		'const render = (rail) => renderToStaticMarkup(createElement(PageRail, { rail }, createElement(PageHeader, { title: rail })));',
		"console.log(JSON.stringify({ bounded: render('bounded'), full: render('full'), reading: render('reading') }));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Record<string, string>;
}

describe('content rail contract', () => {
	test('defines left-pinned full, reading, and bounded compositions', () => {
		expect(contentRailClass).toEqual({
			bounded: 'mr-auto w-full max-w-[80rem]',
			full: 'mr-auto w-full max-w-none',
			reading: 'mr-auto w-full max-w-[61rem]',
		});
	});

	test('maps dominant content types to one documented rail policy', () => {
		expect(pageRailByContentType).toEqual({
			catalog: 'full',
			data: 'full',
			reading: 'reading',
			workflow: 'bounded',
		});
	});

	test('renders PageHeader content on its selected rail', () => {
		const markup = renderPageHeader();

		expect(markup.full).toContain('class="mr-auto w-full max-w-none" data-content-rail="full"');
		expect(markup.reading).toContain(
			'class="mr-auto w-full max-w-[61rem]" data-content-rail="reading"',
		);
		expect(markup.bounded).toContain(
			'class="mr-auto w-full max-w-[80rem]" data-content-rail="bounded"',
		);
		for (const page of Object.values(markup)) {
			expect(page).toContain('<header class="@container relative z-10" data-content-rail=');
			expect(page.match(/max-w-(?:none|\[\d+rem\])/gu)).toHaveLength(1);
		}
	});

	test('requires every page composition to declare a content type, not a width tier', async () => {
		const declaredPaths = Object.keys(pageCompositions).sort();
		const renderedPaths: string[] = [];
		for await (const relativePath of new Bun.Glob('src/**/*.tsx').scan({
			cwd: frontendRoot,
		})) {
			if (
				(await Bun.file(resolve(frontendRoot, relativePath)).text()).includes('<PageHeader')
			) {
				renderedPaths.push(relativePath.replaceAll('\\', '/').replace(/^src\//, ''));
			}
		}
		expect([...renderedPaths].sort()).toEqual(declaredPaths);

		await Promise.all(
			Object.entries(pageCompositions).map(async ([relativePath, contentType]) => {
				const page = await source(relativePath);
				const pageRailTag = page.match(/<PageRail\b[\s\S]*?>/u)?.[0];
				expect(page).toContain(`const PAGE_RAIL = pageRailByContentType.${contentType};`);
				// The negative is the contract. Naming a tier directly reaches the right rail often
				// enough to look fine, and docs proves what that costs: it stayed right only until
				// the tier it named stopped matching the grid the page had been tuned to.
				expect(page).not.toContain('satisfies ContentRail');
				expect(pageRailTag).toBeDefined();
				if (relativePath === 'pages/projects/ProjectsPage.tsx') {
					expect(page).toContain(
						'const pageRail = intakeLane === null ? PAGE_RAIL : pageRailByContentType.workflow;',
					);
					expect(page).toContain('rail={pageRail}');
				} else {
					expect(page).toContain('rail={PAGE_RAIL}');
				}
				expect(page).not.toContain('contentRailClass');
				for (const conflictingClass of [
					'inset-x-',
					'justify-self-',
					'left-',
					'ml-',
					'mr-',
					'mx-',
					'place-self-',
					'right-',
					'translate-x-',
				]) {
					expect(pageRailTag).not.toContain(conflictingClass);
				}
			}),
		);
	});

	test('keeps the page provider as the only content-rail class owner in every subtree', async () => {
		const owners: string[] = [];
		for await (const relativePath of new Bun.Glob('src/**/*.{ts,tsx}').scan({
			cwd: frontendRoot,
		})) {
			if (
				(await Bun.file(resolve(frontendRoot, relativePath)).text()).includes(
					'contentRailClass',
				)
			) {
				owners.push(relativePath.replaceAll('\\', '/').replace(/^src\//, ''));
			}
		}

		expect(owners.sort()).toEqual(['components/shared/PageRail.tsx', 'lib/contentRails.ts']);
	});

	test('sizes the docs outline grid from the rail the page actually declares', async () => {
		const docs = await source('pages/docs/DocsPage.tsx');
		const rail =
			contentRailClass[pageRailByContentType[pageCompositions['pages/docs/DocsPage.tsx']]];
		const railRem = /max-w-\[(\d+)rem\]/u.exec(rail)?.[1];

		// The three-track outline grid is sized from 224 + 480 + 224 and two 24px gaps = 976px, and
		// it is a container query, so the container it measures is the rail element itself. Tuned
		// for 61rem and mounted on the 80rem tier, that arithmetic was correct about a width the
		// page never had, and the article track spent the surplus on bare card beside 427px of
		// prose. The breakpoint and the rail are one decision, so one is derived from the other.
		expect(railRem).toBe('61');
		expect(docs).toContain(`DOCS_OUTLINE_GRID_CLASS = '@min-[${railRem}rem]:`);
	});

	test('lets the pipeline session report take every right edge from its rail', async () => {
		const railWidths = Object.values(contentRailClass).flatMap(
			(rail) => /max-w-\[\d+rem\]/u.exec(rail) ?? [],
		);
		const restated: string[] = [];
		for await (const relativePath of new Bun.Glob('src/pages/pipelineSessions/**/*.tsx').scan({
			cwd: frontendRoot,
		})) {
			const text = await Bun.file(resolve(frontendRoot, relativePath)).text();
			const markup = text.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '');
			if (railWidths.some((width) => markup.includes(width))) {
				restated.push(relativePath.replaceAll('\\', '/').replace(/^src\//, ''));
			}
		}

		// Three right edges in one card — metadata row, step header, card box — because two
		// descendants each capped themselves at the reading width while the page sat on the bounded
		// one. Once the page declares its content type those caps cap nothing, and a descendant
		// restating a rail width is the shape of the defect rather than one instance of it.
		// Comments may still explain the caps that were removed.
		expect(restated).toEqual([]);
	});

	test('keeps the session summary steps inside the rail that is their container', async () => {
		const summary = await source('pages/pipelineSessions/SessionSummaryCard.tsx');
		const railRem = Number(
			/max-w-\[(\d+)rem\]/u.exec(
				contentRailClass[
					pageRailByContentType[
						pageCompositions['pages/pipelineSessions/PipelineSessionReportPage.tsx']
					]
				],
			)?.[1],
		);
		// Comments stripped first, including the source's own note on why the ceiling exists — a
		// guard that reads its own explanation as evidence reports the explanation as the defect.
		const markup = summary.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*/gu, '');
		const steps = [...markup.matchAll(/@min-\[(\d+)rem\]/gu)].map((match) => Number(match[1]));

		// The strip is a direct child of the rail with no card between them, so its query container
		// is the rail and the rail's own width is the ceiling. A step AT that width is the bug, not
		// the boundary case: min-width matches on equality, so five metrics stayed five only while
		// nothing — a scrollbar, a pixel of padding, a rounding step — took anything off the rail.
		expect(steps.length).toBeGreaterThan(0);
		expect(steps.filter((step) => step >= railRem)).toEqual([]);
	});
	test('removes the audited tab-dependent and undeclared page caps', async () => {
		const [audits, docs, history, settings] = await Promise.all([
			source('pages/audits/AuditsPage.tsx'),
			source('pages/docs/DocsPage.tsx'),
			source('pages/projects/detail/HistoryTab.tsx'),
			source('pages/settings/SettingsPage.tsx'),
		]);

		expect(audits).not.toContain("activeTab === 'overrides' ? 'bounded' : 'full'");
		expect(docs).not.toContain('railAlignment');
		expect(docs).not.toContain("'mx-auto grid");
		expect(history).not.toContain('max-w-[72rem]');
		expect(settings).not.toContain("activeTab === 'run-engine' ? 'bounded' : 'full'");
	});
});
