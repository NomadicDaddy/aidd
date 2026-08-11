import { beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
	defaultCollapsedForWidth,
	useSidebarStore,
} from '../../frontend/src/stores/sidebarStore.ts';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

async function* sources(): AsyncGenerator<{ path: string; source: string }> {
	const glob = new Bun.Glob('**/*.tsx');
	for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
		yield {
			path: file.replaceAll('\\', '/'),
			source: stripComments(await Bun.file(join(srcRoot, file)).text()),
		};
	}
}

/**
 * The steps allowed to appear in a container query, and what each one is for.
 *
 * `32rem`, `45rem` and `61rem` are read off the content-width table in `AppLayout.tsx` — each clears
 * the widest column that must stay one-up and catches the narrowest that must not. The rest are site
 * measurements that earned their own number, and each says why at its call site: the width at which
 * a specific two-column split still leaves both columns usable, arrived at by measuring the columns
 * rather than by picking a viewport tier. A step outside this set is almost always a viewport
 * breakpoint transliterated into a container query, which is the mistake the whole mechanism exists
 * to prevent.
 */
const sanctionedSteps = new Set([
	// Sorted as strings, so the widest step leads. The Runs split re-weights here rather than
	// turning on: 1600px is where the table can give points to the transcript and still clear its
	// own `min-w-[56rem]`, measured on the column and not on a window — the 1920 window's content
	// column is 1632px and the 2250 one's is 1962px, while 1536 and 1440 sit below it and keep the
	// original ratio.
	'100rem',
	'32rem',
	'40rem',
	'44rem',
	'45rem',
	'46rem',
	'58rem',
	'61rem',
	'62rem',
	'66rem',
	'68rem',
]);

describe('responsive steps are chosen against content width', () => {
	test('every container-query step is one of the sanctioned ones', async () => {
		const used = new Map<string, string[]>();

		for await (const { path, source } of sources()) {
			for (const match of source.matchAll(/@min-\[([^\]]+)]:/g)) {
				const step = match[1] ?? '';
				used.set(step, [...(used.get(step) ?? []), path]);
			}
		}

		const unsanctioned = [...used]
			.filter(([step]) => !sanctionedSteps.has(step))
			.map(([step, paths]) => `${step} (${[...new Set(paths)].join(', ')})`);

		expect(unsanctioned).toEqual([]);
	});

	test('every file that queries a container also declares one', async () => {
		const offenders: string[] = [];

		for await (const { path, source } of sources()) {
			if (!source.includes('@min-[') || source.includes('@container')) continue;
			// Every section under pages/settings/ is composed into `SettingsPage`, which declares
			// the container on the page root — asserted below, because that one declaration is
			// what makes the whole directory's queries resolve against the settings column.
			if (path.startsWith('pages/settings/')) continue;
			offenders.push(path);
		}

		// A `@min-[…]:` with no containment ancestor does not fail loudly — it resolves against the
		// nearest container in some *other* component, or the viewport, and renders plausibly wrong.
		// The exceptions are components that are only ever rendered into a container their own page
		// declares: `SkillsPage` owns the split and the containment for the catalog, and both console
		// components are rendered nowhere but `RunsPage`, whose root is the container their height
		// chain gates against. `RecipeMetadataCard` is the same case: it is the recipe form's own
		// three fields, rendered nowhere but `RecipeEditMode`, whose root declares the container —
		// and it *cannot* declare its own, because the query is on the card element itself and an
		// element never matches containment it establishes. `LeaderboardCard` is the catalog case
		// again: it is rendered nowhere but the "Most used" card on `TelemetryPage`, which is the
		// element that declares the container its rows measure.
		expect(offenders.sort()).toEqual([
			'pages/recipes/detail/RecipeMetadataCard.tsx',
			'pages/runs/LiveConsole.tsx',
			'pages/runs/PipelineConsoleSummary.tsx',
			'pages/skills/SkillCatalog.tsx',
			'pages/telemetry/LeaderboardCard.tsx',
		]);
		expect(await read('pages', 'telemetry', 'TelemetryPage.tsx')).toContain(
			'<Card className="@container flex flex-col gap-3">',
		);
		expect(await read('pages', 'settings', 'SettingsPage.tsx')).toContain(
			'page-reveal @container',
		);
		expect(await read('pages', 'runs', 'RunsPage.tsx')).toContain('page-reveal @container');
		expect(await read('pages', 'recipes', 'detail', 'RecipeEditMode.tsx')).toContain(
			'page-reveal @container',
		);
	});

	test('no element both declares containment and queries it', async () => {
		const offenders: string[] = [];

		for await (const { path, source } of sources()) {
			for (const match of source.matchAll(/className=(?:"([^"]*)"|'([^']*)')/g)) {
				const value = match[1] ?? match[2] ?? '';
				if (value.includes('@container') && value.includes('@min-['))
					offenders.push(`${path}: ${value}`);
			}
		}

		// A container query cannot style the element that declares the containment; the query would
		// silently jump to the next container out. Containment goes on a wrapper.
		expect(offenders).toEqual([]);
	});

	test('the grids that hold truncation-prone cells key off their own width', async () => {
		// Each of these renders identity badges, metric tiles, or a path/model/version string, and
		// each used to add columns at `sm` — the exact breakpoint where the content column narrows
		// from 607px to 352px with the rail expanded. Form-field grids are deliberately not here.
		const retiered = [
			'pages/pipelineSessions/SessionSummaryCard.tsx',
			// A project card's width comes from how many columns the card grid gave it, so `sm`
			// was measuring the wrong thing in both directions: two columns in a 318px card at
			// 1280 wrapped `Single-user local (explicit)` to four lines.
			'pages/projects/ProjectCardMetrics.tsx',
			'pages/projects/detail/ProjectStatusStrip.tsx',
			'pages/projects/detail/ProjectUsagePanel.tsx',
			'pages/runs/RunDetailPanel.tsx',
			'pages/settings/ExecutionIdentityBadgeLabPage.tsx',
			'pages/telemetry/TelemetrySummary.tsx',
		];

		for (const path of retiered) {
			const source = stripComments(await read(...path.split('/')));
			expect(`${path}: ${source.includes('sm:grid-cols')}`).toBe(`${path}: false`);
			expect(`${path}: ${source.includes('@container')}`).toBe(`${path}: true`);
		}
	});

	test('the constrained specimens hold the width they are labelled with', async () => {
		const lab = stripComments(
			await read('pages', 'settings', 'ExecutionIdentityBadgeLabPage.tsx'),
		);
		const start = lab.indexOf('const constrainedWidths');
		const table = lab.slice(start, lab.indexOf('] as const', start));

		// Without `shrink-0` the 240px and 160px rows both collapse to the cell's leftover width and
		// render identically, which makes the section demonstrate the opposite of its own point.
		for (const width of ['240px', '160px', '120px']) {
			expect(table).toContain(`w-[${width}] shrink-0`);
		}
	});

	test('the content-width table is recorded where the padding is set', async () => {
		const layout = await read('components', 'layout', 'AppLayout.tsx');

		// The numbers the container-query steps are picked off. If this comment goes, the next author
		// has no way to know 640px is where the column gets narrower.
		expect(layout).toContain("collapsed ? 'sm:pl-[5.5rem]' : 'sm:pl-[16.5rem]'");
		for (const entry of [
			'528px',
			'352px',
			'480px',
			'736px',
			'992px',
			'32rem',
			'45rem',
			'61rem',
		]) {
			expect(`table has ${entry}: ${layout.includes(entry)}`).toBe(
				`table has ${entry}: true`,
			);
		}
	});
});

describe('the rail cannot strand a narrow viewport expanded', () => {
	beforeEach(() => {
		useSidebarStore.setState({ collapsed: false, userChosen: false });
	});

	test('the threshold is unchanged', () => {
		expect(defaultCollapsedForWidth(320)).toBe(true);
		expect(defaultCollapsedForWidth(1023)).toBe(true);
		expect(defaultCollapsedForWidth(1024)).toBe(false);
	});

	test('a viewport crossing re-applies the default', () => {
		useSidebarStore.getState().syncToViewport(768);
		expect(useSidebarStore.getState().collapsed).toBe(true);

		useSidebarStore.getState().syncToViewport(1440);
		expect(useSidebarStore.getState().collapsed).toBe(false);
	});

	test('a deliberate toggle is remembered and never overridden', () => {
		useSidebarStore.setState({ collapsed: true, userChosen: false });
		useSidebarStore.getState().toggle();

		expect(useSidebarStore.getState()).toMatchObject({ collapsed: false, userChosen: true });

		// The whole point of the flag: the user asked for the labelled rail at this width, so the
		// width no longer gets a vote.
		useSidebarStore.getState().syncToViewport(390);
		expect(useSidebarStore.getState().collapsed).toBe(false);
	});

	test('rehydration and the media query are both wired to the sync', async () => {
		const store = stripComments(await read('stores', 'sidebarStore.ts'));

		// The first-load default alone cannot fix this: `persist` rehydrates over it, so a value
		// written at desk width would open the rail on a phone.
		expect(store).toContain('onRehydrateStorage');
		expect(store).toContain('state?.syncToViewport(window.innerWidth)');
		expect(store).toContain('.addEventListener(');
		expect(store).toContain('syncToViewport(event.matches ? labelledRailMinWidth : 0)');
	});
});
