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
 * `22rem`, `32rem`, `45rem` and `61rem` are read off the content-width table in `AppLayout.tsx` —
 * each clears the widest column that must stay one-up and catches the narrowest that must not. The
 * rest are site measurements that earned their own number, and each says why at its call site: the
 * width at which a specific two-column split still leaves both columns usable, arrived at by
 * measuring the columns
 * rather than by picking a viewport tier. A step outside this set is almost always a viewport
 * breakpoint transliterated into a container query, which is the mistake the whole mechanism exists
 * to prevent.
 */
const sanctionedSteps = new Set([
	// Sorted as strings, so the widest step leads. The Runs split re-weights here rather than
	// turning on: 1600px is where the table can give points to the transcript and still clear its
	// own `min-w-[63rem]`, measured on the column and not on a window — the 1920 window's content
	// column is 1632px and the 2250 one's is 1962px, while 1536 and 1440 sit below it and keep the
	// original ratio.
	'100rem',
	// Project cards return to a 16px gutter once four 30rem tracks plus three gaps fit.
	'123rem',
	// Scheduled task-card action groups clear their complete 36px controls at this card width.
	// Also the phone step for the Dashboard and Telemetry metric grids: both sections measure
	// 358px inside a 390px viewport and 328px inside a 360px one, so a step between those two
	// widths gives one common handset two columns and the other four stacked rows. 20rem clears
	// the narrower measurement, which is where 158px a column still holds a label and an integer.
	'20rem',
	// Project card metrics clear two 5rem label tracks plus their values at this inner width while
	// the 326px metric region at 1024 remains one-up.
	'22rem',
	// The About card stacks its 80px mark above the title on every phone. Measured on that Card:
	// 358px and 328px at the two phone viewports, then 656px at 768 and 976px at 1440 — nothing
	// lands between. 28rem sits in that empty span, so the step is unambiguous rather than
	// straddling two widths of the same handset class.
	'28rem',
	// Project cards keep their measured 30rem track. Once the results rail clears 110rem the gap
	// tightens to 0.5rem, so four tracks fit the required 122.625rem rail at 2250px.
	'30rem',
	'32rem',
	// Shared filter toolbars keep their primary control plus disclosure inside the measured phone
	// card once its content width reaches 36rem.
	'36rem',
	'40rem',
	// Skill revision cards split once two complete metric cards retain a readable measure.
	'42rem',
	'44rem',
	'45rem',
	'46rem',
	'48rem',
	// Diary controls need both segmented-control groups before sharing a row.
	'55rem',
	// The session summary metric strip is a direct child of the reading page rail, so its
	// container is that rail and 61rem is the container's own maximum rather than a step
	// inside it. 56rem is the widest step with real headroom there: five compact metrics and
	// four 12px gaps still clear 170px each.
	'56rem',
	'58rem',
	// Project Audits reaches its table's measured width at 60rem, so its compact rows yield there.
	'60rem',
	'61rem',
	'62rem',
	// A complete shared filter row clears its fields and trailing readout at this content width.
	'64rem',
	'66rem',
	'68rem',
	// Artifact disclosures split only after both complete metadata rows fit side by side.
	'70rem',
	// Telemetry invocation details give the input and output panes equal readable columns only
	// after the disclosure's own content region clears 1200px.
	'75rem',
	'80rem',
	// Runs needs the 63rem History table plus its 2px Card border, 24rem console, and 1.25rem gap.
	'88.375rem',
	// Skills reverses its detail tracks here, giving Definition its own measure and handing the
	// surplus to the launch column. It is the width at which that reversal first fits rather than
	// a tier: 608px of launch controls, the 1rem gap and the 780px Definition card need 1404px.
	// Below it the elastic Definition track is narrower than the card's cap, so the cap cannot
	// bind and there is no width to leave behind.
	'88rem',
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
			// FilterToolbar consumer classes are applied inside the shared component's container, so
			// the containment boundary is deliberately owned by FilterToolbar rather than each page.
			if (source.includes('<FilterToolbar')) continue;
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
		// element never matches containment it establishes. Both Audits inventory variants render
		// only in `ProjectDetailPage`, whose root owns their rail-sensitive container. The Features
		// table is rendered only in the inventory Card that `FeaturesTab` declares as its container.
		// `LeaderboardCard` is the catalog case again: it is rendered nowhere but the "Most used"
		// card on `TelemetryPage`, which is the element that declares the container its rows measure.
		// `ScheduledOccurrence` is rendered only inside `ScheduledTaskCard`, whose card root owns the
		// container used to align timing after an expanded card takes the full results rail.
		// `DocsNavigationRail` is shared by `DocsPage` and `DocsNotFound`; both page rails declare the
		// container whose width switches the shared rail between its compact and framed variants.
		// `FilterToolbarReadout` and `FilterToolbarStackedActions` are rendered only by
		// `FilterToolbar`; their compact text and phone disclosure query the toolbar container so
		// the trailing unit, button, and panel switch together at the shared step.
		// `DocsOutline` is the same shared case as the rail beside it: both docs pages declare the
		// container, and the outline's own step decides only which of its two presentations shows.
		// `ProjectCostCard` is the catalog case once more: it is rendered nowhere but the "Cost by
		// project" card in `ProjectCostSection`, which declares the container its two-column grid
		// measures — asserted below, since that one declaration is what makes its query resolve.
		expect(offenders.sort()).toEqual([
			'components/shared/FilterToolbarReadout.tsx',
			'components/shared/FilterToolbarStackedActions.tsx',
			'pages/docs/DocsNavigationRail.tsx',
			'pages/docs/DocsOutline.tsx',
			'pages/projects/detail/AuditsDesktopTable.tsx',
			'pages/projects/detail/AuditsMobileList.tsx',
			'pages/projects/detail/FeaturesDesktopTable.tsx',
			'pages/projects/detail/FeaturesTableHeader.tsx',
			'pages/recipes/detail/RecipeMetadataCard.tsx',
			'pages/runs/LiveConsole.tsx',
			'pages/runs/PipelineConsoleSummary.tsx',
			'pages/scheduled/ScheduledOccurrence.tsx',
			'pages/skills/SkillCatalog.tsx',
			'pages/telemetry/LeaderboardCard.tsx',
			'pages/telemetry/ProjectCostCard.tsx',
		]);
		expect(await read('pages', 'telemetry', 'TelemetryPage.tsx')).toContain(
			'<Card className="@container flex flex-col gap-3">',
		);
		expect(await read('pages', 'telemetry', 'ProjectCostSection.tsx')).toContain(
			'<Card className="@container flex flex-col gap-3">',
		);
		expect(await read('pages', 'settings', 'SettingsPage.tsx')).toContain(
			'page-reveal @container',
		);
		expect(await read('pages', 'runs', 'RunsPage.tsx')).toContain('page-reveal @container');
		expect(await read('pages', 'recipes', 'detail', 'RecipeEditMode.tsx')).toContain(
			'page-reveal @container',
		);
		expect(await read('pages', 'projects', 'ProjectDetailPage.tsx')).toContain(
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
		// each must not add columns at `sm` — the exact breakpoint where the content column narrows
		// from 607px to 352px with the rail expanded. Form-field grids are deliberately not here.
		const retiered = [
			'pages/pipelineSessions/SessionSummaryCard.tsx',
			// A step's metadata grid sits inside a card the row indents by its depth, so `sm:` was
			// measuring a window that had already been narrowed twice before the grid saw it.
			'pages/pipelineSessions/StepRunDetail.tsx',
			// A project card's width comes from how many columns the card grid gave it, so `sm`
			// was measuring the wrong thing in both directions: two columns in a 318px card at
			// 1280 wrapped `Single-user local (explicit)` to four lines.
			'pages/projects/ProjectCardMetrics.tsx',
			'pages/projects/detail/ProjectUsagePanel.tsx',
			'pages/runs/RunDetailPanel.tsx',
			// Occurrence rows sit inside auto-fill task cards, so the viewport says nothing about
			// whether their trigger, timestamp, and status columns actually fit.
			'pages/scheduled/ScheduledTaskCard.tsx',
			'pages/settings/ExecutionIdentityBadgeLabPage.tsx',
			'pages/telemetry/TelemetrySummary.tsx',
		];

		for (const path of retiered) {
			const source = stripComments(await read(...path.split('/')));
			expect(`${path}: ${source.includes('sm:grid-cols')}`).toBe(`${path}: false`);
			expect(`${path}: ${source.includes('@container')}`).toBe(`${path}: true`);
		}
	});

	test('the project status strip keeps all phone status facts in one compact row', async () => {
		const status = stripComments(
			await read('pages', 'projects', 'detail', 'ProjectStatusStrip.tsx'),
		);

		expect(status).toContain('className="grid grid-cols-[minmax(0,1.5fr)');
		expect(status).toContain('sm:flex sm:flex-wrap');
		expect(status).toContain('shortLabel="Source"');
		expect(status).not.toContain('@container');
	});

	test('the constrained specimens hold the width they are labelled with', async () => {
		// The measuring half of the lab lives beside the page: the page is a specimen sheet, this
		// is the instrument, and together they exceeded the file-size cap.
		const lab = stripComments(
			await read('pages', 'settings', 'ExecutionIdentityConstrainedSpecimens.tsx'),
		);
		const start = lab.indexOf('const constrainedWidths');
		const table = lab.slice(start, lab.indexOf('] as const', start));

		// Without `shrink-0` the wider rows collapse to the cell's leftover width and render
		// identically, which makes the section demonstrate the opposite of its own point.
		//
		// 179px is the Runs MODEL column the docstring names as the real budget, and 96px is the
		// tight step: at 160px the Production badge measures 153px and renders identically to its own
		// 240px row.
		for (const width of ['240px', '179px', '120px', '96px']) {
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
