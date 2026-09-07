import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function read(path: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src', path)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * An end-alignment utility, with whatever variant prefix precedes it. `prefix` is lazy and stops at
 * the first character a Tailwind variant cannot contain, so `sm:justify-end` captures `sm:` and a
 * bare `justify-end` captures nothing — which is the whole distinction this file is built on.
 */
const ALIGNMENT = /(?<prefix>[A-Za-z0-9@:[\]().%_/-]*?)(?<token>justify-end|text-right|ml-auto)/g;

function bareAlignmentCount(source: string): number {
	let count = 0;
	for (const match of stripComments(source).matchAll(ALIGNMENT)) {
		if ((match.groups?.prefix ?? '').length === 0) count += 1;
	}
	return count;
}

/**
 * Every file that carried an end-alignment utility with no variant prefix when the mobile sweep
 * measured this app, with the count it carried. An unprefixed `justify-end`, `text-right` or
 * `ml-auto` holds at 390 as much as at 2250, so each one is a claim that the element has a
 * counterparty on its line at every width — a sibling it sits opposite, or a column it aligns
 * down. The claim is often true (a numeric table column, a two-button dialog footer), which is
 * why this is a census and not a ban.
 *
 * The freeze is on the count, so a new site fails here rather than shipping unmeasured. When one
 * appears: open the surface at 390x844, and if the element ends up alone on its line, gate the
 * alignment at the breakpoint where the layout changes axis (see `GATED` below) rather than
 * deleting it — the desktop sweep measured these rows as correct wide, and they must stay correct
 * wide. If it does have a counterparty, add it here with the count.
 */
const REGISTERED: Readonly<Record<string, number>> = {
	'components/layout/AppLayout.tsx': 1,
	'components/layout/SidebarNav.tsx': 1,
	'components/shared/AuthTokenDialog.tsx': 1,
	'components/shared/ChatMessageBubble.tsx': 1,
	'components/shared/CommitBar.tsx': 1,
	'components/shared/CommitDiffDialog.tsx': 1,
	'components/shared/EditorActionBar.tsx': 1,
	'components/shared/FilterToolbar.tsx': 1,
	'components/shared/FilterToolbarReadout.tsx': 4,
	'components/shared/FilterToolbarStackedActions.tsx': 1,
	'components/shared/MarkdownTable.tsx': 1,
	'components/shared/OverflowScroller.tsx': 1,
	'components/ui/command.tsx': 1,
	'pages/audits/tabs/CatalogTable.tsx': 2,
	'pages/audits/tabs/CatalogToolbar.tsx': 1,
	'pages/audits/tabs/LaunchTargetsCard.tsx': 1,
	'pages/audits/tabs/OverridesList.tsx': 3,
	'pages/dashboard/FeatureStatusRows.tsx': 2,
	'pages/dashboard/FeatureSummaryRows.tsx': 3,
	'pages/dashboard/FleetMaturityCard.tsx': 1,
	'pages/dashboard/WaitingApprovalRows.tsx': 1,
	'pages/docs/DocsOutline.tsx': 1,
	'pages/docs/DocsPager.tsx': 2,
	'pages/projects/detail/ActiveRunsPanel.tsx': 2,
	'pages/projects/detail/ArtifactInventoryRow.tsx': 2,
	'pages/projects/detail/AuditCompactRow.tsx': 1,
	'pages/projects/detail/auditRowContent.tsx': 2,
	'pages/projects/detail/AuditsDesktopTable.tsx': 2,
	'pages/projects/detail/CodeFileSearchResults.tsx': 1,
	'pages/projects/detail/CodeFileTree.tsx': 1,
	'pages/projects/detail/CodeFileViewer.tsx': 1,
	'pages/projects/detail/FeatureMobileCard.tsx': 1,
	'pages/projects/detail/FeaturesTab.tsx': 2,
	'pages/projects/detail/HistoryTab.tsx': 1,
	'pages/projects/detail/MetadataRow.tsx': 1,
	'pages/projects/detail/MilestoneFormDialog.tsx': 1,
	'pages/projects/detail/MilestonePlanDialog.tsx': 1,
	'pages/projects/detail/MilestonesTable.tsx': 2,
	'pages/projects/detail/NotesTab.tsx': 2,
	'pages/projects/detail/ProjectUsagePanel.tsx': 9,
	'pages/projects/detail/RecentActivity.tsx': 1,
	'pages/projects/detail/RepositoryInfoCard.tsx': 1,
	'pages/projects/detail/workingTree/CommitMessageDialog.tsx': 1,
	'pages/projects/ProjectCreateActions.tsx': 1,
	'pages/projects/ProjectIngestLane.tsx': 1,
	'pages/recipes/RecipeGrid.tsx': 4,
	'pages/runs/PipelineStepSubRows.tsx': 2,
	'pages/runs/PipelineStepTableRows.tsx': 2,
	'pages/scheduled/ScheduledTaskCard.tsx': 1,
	'pages/settings/SettingsToolbar.tsx': 1,
	'pages/settings/SystemMetricsVitals.tsx': 10,
	'pages/skills/SkillDetailsCard.tsx': 1,
	'pages/telemetry/LeaderboardCard.tsx': 1,
	'pages/telemetry/ProjectCostCard.tsx': 1,
	'pages/telemetry/TelemetryComponents.tsx': 1,
};

/**
 * The eleven sites the mobile sweep measured as alone on their line at 390x844 or 360x800, with the width each
 * one's alignment is now gated at and the void it was measured over. The gate goes where the layout
 * changes axis, never at a width where the alignment is still correct.
 */
const GATED: readonly {
	absent: readonly string[];
	/**
	 * Set where the wide alignment is the unprefixed utility and the gate is a prefixed utility that
	 * reverses it below a width. The default is the other way round — a prefixed alignment that only
	 * applies wide — and only the default can be checked by looking for a prefixed alignment.
	 */
	gatedByCounterUtility?: true;
	file: string;
	measured: string;
	/** Set where the site is hidden above the gate anyway, so there is no wide alignment to keep. */
	neverWide?: true;
	present: readonly string[];
}[] = [
	{
		absent: [],
		file: 'components/shared/FilterToolbarReadout.tsx',
		gatedByCounterUtility: true,
		measured:
			'five dashboard readouts alone on their line, 107-187px of a 324px card; four of the five ' +
			'render outside any FilterToolbar, so the hasMobileFilters gate never applied to them',
		present: [
			'ml-auto flex max-w-full shrink-0 items-center justify-end gap-3',
			'@max-[36rem]:ml-0 @max-[36rem]:justify-start',
		],
	},
	{
		absent: ['"grid gap-3 px-4 py-3', ' text-right'],
		file: 'pages/settings/SettingsStatusPanels.tsx',
		measured: 'command cell 223-238px of a 324px row, on all four rows',
		present: [
			'@min-[45rem]:text-right',
			'grid-cols-[auto_minmax(0,1fr)]',
			'@min-[45rem]:col-span-1',
		],
	},
	{
		absent: ['justify-end'],
		file: 'pages/audits/tabs/CatalogCards.tsx',
		measured: 'Select All 278px of a 358px rail; the row is xl:hidden, so it is never wide',
		neverWide: true,
		present: ['<div className="flex">'],
	},
	{
		// A rail already gated at `sm` with an ungated `ml-auto` inside it: the gate moved the rail
		// and the spread within it survived, which is why the census counts utilities and not files.
		absent: ['<div className="ml-auto">'],
		file: 'pages/projects/detail/AuditCompactRow.tsx',
		measured: 'Details alone 217px of a 298px row at 360x800',
		present: ['sm:ml-auto', 'sm:justify-end'],
	},
	{
		absent: ['grid-cols-[auto_auto] items-end justify-end'],
		file: 'components/shared/CardSortControl.tsx',
		measured: 'Sort by caption 155px of a 324px rail',
		present: ['grid-cols-[minmax(0,1fr)_auto]', 'sm:grid-cols-[auto_auto]', 'sm:justify-end'],
	},
	{
		absent: ['items-center justify-end gap-x-3'],
		file: 'pages/projects/detail/InterviewTab.tsx',
		measured: 'completion bar alone 236px of a 332px header',
		present: ['justify-start', 'sm:justify-end'],
	},
	{
		absent: ['sm:contents', 'sm:order-last sm:ml-auto'],
		file: 'pages/projects/detail/HistoryTab.tsx',
		gatedByCounterUtility: true,
		measured: 'help button alone 280px of a 324px filter bar',
		present: ['order-last ml-auto max-sm:hidden'],
	},
	{
		// The only site measured at 360 and not at 390: at 390 the badge and both buttons still fit
		// on one line of the rail, so nothing was stranded and the earlier pass saw nothing wrong.
		absent: [],
		file: 'pages/dashboard/WaitingApprovalRows.tsx',
		measured: 'Dismiss alone 182px of a 268px card at 360x800, below a right-packed Approve',
		present: ['justify-start gap-2 sm:justify-end'],
	},
	{
		absent: ['"text-right text-muted-foreground"'],
		file: 'pages/telemetry/OutputTimeseriesChart.tsx',
		measured: 'coverage caption 131px of a 254px line',
		present: ['sm:text-right'],
	},
];

/**
 * Two sites where end alignment carries meaning rather than position, so the rule above does not
 * apply to them. Both were measured alone on their line at 390 and both are correct that way: the
 * side a chat bubble sits on says who spoke, and the side a pager link sits on says which way it
 * goes. Gating either at a breakpoint would delete the fact, not the gap.
 */
const CONVENTIONS: readonly { file: string; token: string; why: string }[] = [
	{
		file: 'components/shared/ChatMessageBubble.tsx',
		token: 'ml-auto',
		why: 'the right side is the speaker, not the end of a row',
	},
	{
		file: 'pages/docs/DocsPager.tsx',
		token: 'ml-auto',
		why: 'the right side is forward, and Next is often the only link',
	},
];

describe('mobile end alignment', () => {
	test('every unprefixed end-alignment site is registered with its count', async () => {
		const found: Record<string, number> = {};
		for await (const relative of new Bun.Glob('src/**/*.tsx').scan({ cwd: frontendRoot })) {
			const file = relative.replaceAll('\\', '/').replace(/^src\//u, '');
			const count = bareAlignmentCount(
				await Bun.file(resolve(frontendRoot, relative)).text(),
			);
			if (count > 0) found[file] = count;
		}

		// Both directions matter. A file that gained a site has an element nobody has looked at on a
		// phone; a file that lost one has had a measured decision reverted or moved, and the entry
		// here would then be describing a layout that no longer exists.
		expect(found).toEqual(REGISTERED);
	});

	test('each measured site is gated at a breakpoint, not stripped', async () => {
		for (const site of GATED) {
			const source = stripComments(await read(site.file));
			for (const needle of site.present) {
				expect(`${site.file} :: ${needle} :: ${site.measured}`).toBe(
					source.includes(needle)
						? `${site.file} :: ${needle} :: ${site.measured}`
						: `MISSING in ${site.file}`,
				);
			}
			for (const needle of site.absent) {
				expect(`${site.file} :: no ${needle}`).toBe(
					source.includes(needle)
						? `STILL PRESENT in ${site.file}: ${needle}`
						: `${site.file} :: no ${needle}`,
				);
			}
		}
	});

	test('none of the gated sites drops its wide alignment', async () => {
		// The fix is a gate, so the wide half must survive it: every gated file still ends something
		// at a width. Deleting the alignment outright would satisfy the census test above and leave
		// the desktop layout the desktop sweep measured as correct silently worse. The exception is
		// a site that is hidden above its gate — the audits catalog cards are xl:hidden, so the row
		// has no wide rendering to preserve and its alignment is removed rather than gated. The
		// other is a site gated by a counter-utility: the shared readout keeps its bare ml-auto as
		// the wide behaviour and reverses it under a container query, so what survives the gate is
		// the unprefixed half and `present` above is what checks it.
		for (const site of GATED) {
			if (site.neverWide === true || site.gatedByCounterUtility === true) continue;
			const source = stripComments(await read(site.file));
			const prefixed = [...source.matchAll(ALIGNMENT)].filter(
				(match) => (match.groups?.prefix ?? '').length > 0,
			);
			expect(`${site.file} keeps a gated alignment: ${prefixed.length > 0}`).toBe(
				`${site.file} keeps a gated alignment: true`,
			);
		}
	});

	test('alignment that encodes meaning is exempt and says why', async () => {
		for (const convention of CONVENTIONS) {
			const source = stripComments(await read(convention.file));
			expect(`${convention.file} keeps ${convention.token} — ${convention.why}`).toBe(
				source.includes(convention.token)
					? `${convention.file} keeps ${convention.token} — ${convention.why}`
					: `${convention.file} lost ${convention.token}`,
			);
			// A convention is exempt because of what the side means, so it must not be gated at a
			// width: a chat bubble that centres below `sm` no longer says who spoke.
			expect(`${convention.file} ungated: true`).toBe(
				`${convention.file} ungated: ${!source.includes(`sm:${convention.token}`)}`,
			);
		}
	});
});
