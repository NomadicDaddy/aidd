import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');
const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

async function detail(file: string): Promise<string> {
	return await readFile(resolve(DETAIL_ROOT, file), 'utf8');
}

async function src(file: string): Promise<string> {
	return await readFile(resolve(FRONTEND_SRC, file), 'utf8');
}

describe('dependency-graph edges', () => {
	test('keeps resting edges legible and selected edges strongest', async () => {
		const edges = await detail('dependencyGraphEdges.tsx');
		const panels = await detail('dependencyGraphPanels.tsx');

		expect(edges).toContain('strokeWidth={isSelectedEdge || isCycleEdge ? 2 : 1}');
		expect(edges).toContain("'text-accent opacity-100'");
		expect(edges).toContain("'text-control-border opacity-15'");
		expect(edges).not.toContain("'text-control-border opacity-100'");
		expect(panels).toContain('<Card className="min-w-0 overflow-hidden p-0" variant="sunken">');
		expect(panels).toContain('className="relative origin-top-left"');
		expect(panels).not.toContain('linear-gradient');
	});
});

describe('maturity stage disclosures', () => {
	test('pair hover feedback with expanded-state and keyboard-focus semantics', async () => {
		const source = await detail('MaturityStageBlock.tsx');
		const styles = await src('index.css');

		expect(source).toContain('transition-colors duration-150 hover:bg-muted/40');
		expect(source).toContain('aria-controls={panelId}');
		expect(source).toContain('aria-expanded={expanded}');
		expect(source).toContain('aria-labelledby={headerId}');
		expect(styles).toMatch(/:focus-visible \{[\s\S]*outline: 2px solid var\(--ring\)/u);
	});
});

describe('per-row action cells', () => {
	test('delete repeated down a list is quiet until hover, never filled danger', async () => {
		const tones = await src('lib/tones.ts');
		expect(tones).toContain('export const dangerRowActionClass');

		for (const file of ['FeatureActionVariants.tsx', 'MilestonesTable.tsx']) {
			const source = await detail(file);
			expect(source).toContain('dangerRowActionClass');
			expect(source).not.toContain('variant="danger"');
		}
	});

	test('a feature row offers no filled primary at all', async () => {
		const source = await detail('FeatureActionVariants.tsx');
		// The row's buttons live in two files since the launch control and the status select moved
		// to FeatureActionControls.tsx; the claim is about the row, so both files carry it.
		const controls = await detail('FeatureActionControls.tsx');
		// `Approve with decision` sat beside `Approve` as a second filled primary, so the row put
		// two equal-weight calls to action next to a destructive one. Dropping the second left one
		// plate per row, which is one per *feature*: a waiting-approval queue then stacks a column
		// of saturated CTAs on a page whose own primary action is elsewhere. So both are
		// `secondary` — the call WaitingApprovalRows already made on the dashboard for this exact
		// shape, and the rule the variant table in button.tsx now states.
		// Matched loosely on whitespace: the buttons are nested a level deeper now that one shares
		// a row with the decision field, and the tone is the assertion — not the indentation.
		expect(source).toMatch(/title="Approve with decision"\s+variant="secondary">/u);
		expect(source).toMatch(/title="Approve"\s+variant="secondary">/u);
		// Stated from both sides. "At most one" was still literally true at zero, so the count that
		// used to carry this property could be satisfied by deleting the variable it named.
		expect(source).not.toContain('variant="primary"');
		expect(controls).not.toContain('variant="primary"');
	});

	test('each tab-level work starter is the primary beside secondary peers', async () => {
		const audits = await detail('AuditsTab.tsx');
		const dependencies = await detail('SelectedFeaturePanel.tsx');

		expect(audits).toMatch(/Run Selected[\s\S]*Review Selected/u);
		expect(audits).toMatch(/onClick=\{\(\) => runSelected\(false\)\}\s+variant="primary">/u);
		expect(audits).not.toContain('title={runDisabledReason}');
		expect(dependencies).toMatch(/onClick=\{onLaunchRun\}[\s\S]*?variant="primary">/u);
	});

	test('the status select shares its line instead of claiming one', async () => {
		const source = await detail('FeatureActionControls.tsx');

		// `w-full` on a flex item resolves to the whole action group, so this one select made every
		// backlog row three lines tall at 2321 and four at 1280 — the column's width never mattered.
		// `selectClass` carries no width for exactly this reason, and says so.
		expect(source).toContain('className={`${selectClass} px-2`}');
		expect(source).not.toContain('${selectClass} w-full');
	});

	test('the decision field sits with the button that consumes it', async () => {
		const source = await detail('FeatureActionVariants.tsx');

		// The Input took a line of its own and pushed `Approve with decision` onto a third, which is
		// what made a waiting-approval row the tallest in the table: 221px at 1280, 181px at 2321.
		expect(source).toContain(
			'<div className="flex w-full min-w-0 flex-wrap items-center gap-2">',
		);
		// `w-auto` is load-bearing: `Input` merges `formControlClass`, which is `w-full`.
		expect(source).toContain('className="w-auto min-w-32 flex-1"');
		expect(source).not.toContain('className="w-full min-w-0"');
	});

	test('the feature table preserves compact rows at every supported desktop width', async () => {
		const source = await detail('FeaturesDesktopTable.tsx');
		const cards = await detail('FeatureMobileCard.tsx');
		const controls = await detail('FeatureRowControls.tsx');
		const formStyles = await src('lib/formStyles.ts');
		const tab = await detail('FeaturesTab.tsx');

		expect(source).toContain('hidden max-w-[104rem] @min-[61rem]:block');
		expect(tab).toContain('@min-[61rem]:hidden');
		expect(tab).toContain('<EmptyState filterReset="toolbar" filters={emptyFilters}>');
		expect(tab).toContain('No features match the active filters.');
		expect(cards).not.toContain('>Passes</dt>');
		expect(formStyles).toContain('export const quietSelectClass');
		expect(controls).toContain('`${quietSelectClass} max-w-full px-2`');
		expect(formStyles).not.toContain('max-w-44');

		// Actions had Milestone's 14% for up to five controls, and this cell is what sets the row
		// height. Below 1536 it was narrower than its own widest single control — 184px of `Approve
		// with decision` in 139px. At 2321 a backlog row goes 141px to 61px, waiting-approval 181
		// to 101, and the cell stops overflowing at 1280 and 1536.
		const header = await detail('FeaturesTableHeader.tsx');
		const widths = await detail('featureTableWidths.ts');
		expect(header).not.toContain('<col className="w-[14%]" />');

		// Every track but Feature is rem, not percent. A percentage is not a width: the same 6%
		// that fit `SHIPPED` at 1600 starved it at 1280, and the nine-column table made that
		// unworkable — each of these is a content floor, and a floor is a rem.
		expect(header).not.toContain('%]');
		expect(header).toContain('<col className="w-auto" />');
		expect(header).toContain('<col className="hidden w-[7.5rem] @min-[88rem]:table-column" />');
		expect(header).toContain('<col className="w-[6.5rem]" />');
		expect(header).toContain('<col className={featureActionTrack(rows).column} />');

		// The action track still moves with the statuses on the page, and the table's floor moves
		// with it rather than reserving 27rem of scroll for buttons no row is rendering. 81rem is
		// the number that matters: measured in the browser, a page without backlog rows fits a
		// 1600px window whole. The roomier tracks it replaced put the table at 1408 in a 1310
		// scroller, which hid the action buttons behind a scrollbar nobody could see they needed.
		expect(widths).toContain(
			"column: 'w-80', table: 'min-w-[71rem] @min-[88rem]:min-w-[88rem]'",
		);
		expect(widths).toContain(
			"column: 'w-64', table: 'min-w-[67rem] @min-[88rem]:min-w-[84rem]'",
		);
		expect(widths).toContain(
			"column: 'w-36', table: 'min-w-[60rem] @min-[88rem]:min-w-[77rem]'",
		);
		expect(header).toContain('hidden px-4 py-3 @min-[88rem]:table-cell');
		expect(widths).toContain(
			"'shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.35)] border-l border-control-border'",
		);
		expect(header).toContain('sticky right-0 z-20 bg-muted');
		expect(header).toContain('${featureActionEdgeClass}');
		expect(await detail('FeaturesDesktopTable.tsx')).toContain('sticky right-0 z-[5] bg-card');

		// Below that floor the OverflowScroller scrolls — the house answer every other wide table
		// in this app already gives — instead of squeezing nine columns until their headers wrap.
		expect(source).toContain('${featureActionTrack(rows).table}');
		expect(source).toContain('<OverflowScroller');

		// Status keeps its widest-badge floor. That cell was already 19px short of a
		// `waiting_approval` badge at 1280, and paying for the new columns out of it would deepen
		// a defect this change is not fixing.
		expect(header).toContain('<col className="w-[10rem]" />');
	});

	test('the audits row keeps its two secondaries', async () => {
		const source = await detail('AuditsDesktopTable.tsx');
		expect(source).not.toContain('variant="danger"');
		expect(source).not.toContain('variant="primary"');
	});
});

describe('git refs', () => {
	test('render mono wherever the repository cards state one', async () => {
		const refs = await detail('RepositoryRefsCard.tsx');
		const localMonoValues = refs.match(/font-mono/gu)?.length ?? 0;
		const sharedPathValues = refs.match(/<FilePath/gu)?.length ?? 0;
		expect(localMonoValues + sharedPathValues).toBeGreaterThanOrEqual(6);

		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).not.toContain('<Stat label="Current branch"');
		expect(info).not.toContain('mono ?');
		expect(info).toContain('<code className="font-mono text-xs text-foreground">');
	});

	test('both repository cards name themselves and stop at two heading steps', async () => {
		// Two of the Repository tab's cards opened with no title at all, so their inner `text-xs`
		// labels — Top contributors, Languages, Branches, Stashes, Worktrees — were carrying the
		// heading weight of a whole card at the size of a caption.
		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).toContain('title="Repository statistics"');
		expect(info).not.toContain('text-xs font-semibold text-foreground');

		const refs = await detail('RepositoryRefsCard.tsx');
		expect(refs).toContain('title="Refs"');
		expect(refs).toContain('<RepositoryPanelHeading');
		expect(refs).not.toContain('<h4');

		const panelHeading = await detail('RepositoryPanelHeading.tsx');
		expect(panelHeading).toContain('level="subsection"');
	});

	test('the statistics panel keeps a measure the eye can cross', async () => {
		// Uncapped, `Current branch` sat at x=555 and `main` at x=2170 on a 2250 viewport, and the
		// language bars stretched onto a ~1470px track where the third language was a 1px stub.
		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).toContain(
			'<Card className={`@container flex flex-col gap-5 ${tableColumnClass}`}>',
		);
		expect(info).toContain('@min-[61rem]:max-w-none');
		expect(info).not.toContain('xl:max-w-[48rem]');
	});
});

describe('run tables', () => {
	test('the panels that own a card take the declared column, not an intrinsic width', async () => {
		for (const file of ['ProjectUsagePanel.tsx', 'ActiveRunsPanel.tsx']) {
			const source = await detail(file);
			expect(source).toContain('tableColumnClass');
			expect(source).not.toContain('tableMeasureClass');
		}

		// Auto layout lets the execution target stop at its content while the outer cap still
		// bounds the table composition.
		const usage = await detail('ProjectUsagePanel.tsx');
		expect(usage).toContain('overflow-hidden p-0 ${tableColumnClass}');
		expect(usage).toContain('className={contentSizedTableClass}');

		// Two measures, declared once each in the file that owns table furniture. The column is
		// what siblings agree on; the intrinsic measure is for scrolled content and must never
		// be where a card's own right edge comes from. They were one constant until the Runs tab
		// showed three peer cards ending at 1280 / 1962 / 1280 on one screen. Neither may be
		// declared a second time elsewhere, which is the drift lib/typography.ts once carried.
		const tableStyles = await src('lib/tableStyles.ts');
		expect(tableStyles).toContain("export const tableColumnClass = 'w-full max-w-[80rem]';");
		expect(tableStyles).toContain(
			"export const tableMeasureClass = 'w-max min-w-[min(100%,80rem)] max-w-full';",
		);

		const typography = await src('lib/typography.ts');
		expect(typography).not.toContain('tableMeasureClass');
		expect(typography).not.toContain('tableColumnClass');
	});
});

describe('code browser', () => {
	test('keeps tree depth, selection, filtering, focus, and source rhythm legible', async () => {
		const tab = await detail('CodeTab.tsx');
		const tree = await detail('CodeFileTree.tsx');
		const viewer = await detail('CodeFileViewer.tsx');

		// Files reserve the same leading chevron slot as folders, so every depth step moves a
		// child name right instead of first paying back a missing control.
		expect(tree).toContain('<span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />');
		expect(tree).toContain('depth * 0.85');
		expect(tree).toContain('shadow-[inset_4px_0_0_var(--accent)]');

		// Both bare tree controls use the same visible ring and offset treatment as shared buttons.
		for (const source of [tab, tree]) {
			expect(source).toContain('focus-visible:ring-ring/80');
			expect(source).toContain('focus-visible:ring-offset-2');
			expect(source).toContain('focus-visible:ring-offset-background');
			expect(source).not.toContain('ring-ring/40');
		}

		expect(tab).toContain("matchingFileCount === 1 ? 'result' : 'results'");
		expect(tab).toContain("files.length === 1 ? 'file' : 'files'");
		expect(viewer).toContain('text-xs leading-relaxed');
		expect(viewer).toContain('icons/clipboard-copy');
		expect(viewer).toContain('p-3 sm:flex-row sm:items-center');
		expect(viewer).toContain('items-center gap-1 self-end sm:self-auto');
		expect(viewer).toContain('const fileName = pathSegments.at(-1) ?? data.path');
		expect(viewer).toContain('path={fileName}');
		expect(viewer).toContain('title={data.path}');
		expect(viewer).not.toContain('icons/code-2');
	});

	test('keeps labelled file navigation before the viewer below the split', async () => {
		const tab = await detail('CodeTab.tsx');
		const navigation = tab.indexOf('aria-controls={navigationId}');
		const viewer = tab.indexOf('<CodeFileViewer');

		expect(navigation).toBeGreaterThan(-1);
		expect(navigation).toBeLessThan(viewer);
		expect(tab).toContain('aria-expanded={navigationOpen}');
		expect(tab).toContain('aria-label={`Tracked files, ${selectedPath');
		expect(tab).toContain('min-h-11 w-full');
		expect(tab).toContain("navigationOpen ? 'flex' : 'hidden'");
		expect(tab).toContain('className="max-h-[28rem] @min-[61rem]:max-h-none"');
		expect(tab).toContain('@min-[61rem]:hidden');
		expect(tab).toContain('setNavigationOpen(false)');
	});

	test('both panes take one viewport-derived height and scroll inside it', async () => {
		const shared = await detail('codeBrowserHeight.ts');
		expect(shared).toContain("'@min-[61rem]:h-[var(--fill-height)] @min-[61rem]:min-h-0'");
		expect(shared).not.toContain('calc(100vh-');
		expect(shared).toContain('export const codeBrowserScrollerClass');

		// The gate is the card's width, not the window's: with the rail expanded the content column
		// is about 992px at a 1024 viewport, so `lg:` split the browser in two roughly 32px before
		// the card had room for it, and un-split it when the rail collapsed at the same viewport.
		expect(shared).not.toContain("'lg:");

		const tab = await detail('CodeTab.tsx');
		expect(tab).toContain('codeBrowserHeightClass');
		expect(tab).toContain('gutterPx: projectDetailViewportGutterPx');
		expect(tab).not.toContain('minHeightPx');
		expect(tab).toContain('refreshKey: tree.data');
		expect(tab).toContain('ref={browserRef}');
		expect(tab).toContain('min-h-[32rem] grid-cols-[minmax(0,1fr)] gap-0 @min-[61rem]:min-h-0');
		expect(tab).toContain('<Card className="@container overflow-hidden p-0">');
		expect(tab).not.toContain('lg:grid-cols-');

		// Two tree widths. 22rem truncates a nested route path; at 2250 the card has the room to
		// give the names 30rem and still leave the viewer more measure than source lines use.
		expect(tab).toContain('@min-[61rem]:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]');
		expect(tab).toContain('@min-[100rem]:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]');

		for (const file of ['CodeFileTree.tsx', 'CodeFileViewer.tsx']) {
			const source = await detail(file);
			expect(source).toContain('codeBrowserScrollerClass');
			// No per-pane caps: 34rem on the tree and 42rem on the viewer would sit 128px apart.
			expect(source).not.toContain('max-h-[34rem]');
			expect(source).not.toContain('max-h-[42rem]');
		}
	});
});

describe('artifact inventory', () => {
	test('both inventories render one row component under one type rule', async () => {
		const row = await detail('ArtifactInventoryRow.tsx');
		const utilities = await detail('artifactsUtils.ts');
		expect(utilities).toContain('function labelAddsNothing');
		expect(row).toContain('truncate text-sm font-medium text-foreground');

		for (const file of ['ArtifactRow.tsx', 'MaturityArtifactRow.tsx']) {
			const source = await detail(file);
			expect(source).toContain('<ArtifactInventoryRow');
			// The row shell belongs to the shared component; an adapter that still draws one has
			// forked the type treatment again.
			expect(source).not.toContain('rounded-md border border-border px-2.5');
		}
	});

	test('the name and its identifier stop sharing one line on a phone', async () => {
		const row = await detail('ArtifactInventoryRow.tsx');

		// Measured at 390px: `project-structure.md` had 115px for 136px of text and
		// `.aidd/project-structure.md` 158px for 187px, because the name competed on one line with
		// a shrink-0 group of badges, an age and a button. Both halves of the row's own name were
		// truncated at once, which left nothing saying which artifact the row was.
		expect(row).toContain(
			'flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2',
		);
		expect(row).toContain(
			'sm:grid sm:grid-cols-[minmax(0,44rem)_minmax(23rem,28rem)] sm:items-center',
		);
		// The row shell no longer starts life as a single wrapping line.
		expect(row).not.toContain('flex flex-wrap items-center justify-between gap-2 rounded-md');
	});
});

describe('the overview metadata row survives a long value', () => {
	test('the value can shrink instead of pushing out of the card', async () => {
		const row = await detail('MetadataRow.tsx');

		// The values are not all short strings: one is an ExecutionIdentityBadges beside a link,
		// another is a stack display. Without `min-w-0` a flex item cannot shrink below its content.
		expect(row).toContain('min-w-0 text-right text-foreground');
	});

	test('neither overview grid goes two-up before the content column can hold it', async () => {
		const metadata = await detail('OverviewTab.tsx');
		const summary = await detail('OverviewSummary.tsx');

		expect(metadata).toContain('grid items-start gap-4 lg:grid-cols-2');
		expect(summary).toContain('grid gap-4 lg:grid-cols-3');
	});
});

describe('relative age', () => {
	test('is one component with the exact stamp in the tooltip', async () => {
		const component = await src('components/shared/RelativeAge.tsx');
		expect(component).toContain('<time');
		expect(component).toContain('content={formatDate(value)}');
		expect(component).toContain('disclosureLabel={`${relative}. Exact timestamp`}');
		expect(component).toContain('touchAlignment="start"');
		expect(component).not.toContain('title={formatDate(value)}');
		expect(component).toContain('dateTime=');
	});

	test('project-detail surfaces use it rather than their own spelling', async () => {
		const users = [
			'ArtifactInventoryRow.tsx',
			'ArtifactViewerDialog.tsx',
			'ArtifactsTab.tsx',
			// Both halves of the Features pair, which is where Added and Completed are rendered.
			'FeatureMobileCard.tsx',
			'FeaturesDesktopTable.tsx',
			'MaturityAuditRow.tsx',
			'OverviewTab.tsx',
			'RecentActivity.tsx',
			// Both halves of the Reports pair, which is where the age is now rendered.
			'ReportsDesktopTable.tsx',
			'ReportsMobileList.tsx',
			'RepositoryInfoCard.tsx',
		];
		for (const file of users) {
			const source = await detail(file);
			expect(source).toContain('<RelativeAge');
			// The four spellings this replaced all wrote both values inline, one order or the other.
			expect(source).not.toMatch(/\{formatDate\([^)]*\)\} \(\{formatRelativeAge/u);
		}
	});
});

describe('commit chips', () => {
	test('disclose the complete subject and hash without a native title', async () => {
		const component = await src('components/shared/CommitChips.tsx');

		expect(component).toContain('<Tooltip content={`${commit.subject} · ${commit.hash}`}');
		expect(component).not.toContain('title={`View changes for ${commit.hash}`}');
		expect(component).toContain(
			'<span className="min-w-0 text-left whitespace-normal sm:truncate">',
		);
		expect(component).toContain('{commit.subject}');
	});
});

describe('management tab', () => {
	test('the destructive card identifies danger without hiding the armed action', async () => {
		const source = await detail('DeleteProjectCard.tsx');
		expect(source).toContain("deleteMode === 'directory' && toneBorder.red");
		expect(source).toContain("deleteMode === 'directory' && toneSurface.red");
		expect(source).toContain('variant="danger"');
	});

	test('the delete control names its selected operation', async () => {
		const source = await detail('DeleteProjectCard.tsx');
		expect(source).toContain("'Remove .aidd metadata'");
		expect(source).toContain("'Delete project directory'");
		expect(source).toContain(
			'deleteProject.isPending ? deletePendingLabel : deleteActionLabel',
		);
	});

	test('the confirmation instruction is body copy beneath a concise field label', async () => {
		const source = await detail('DeleteProjectCard.tsx');
		expect(source).toContain('label="Confirm project path"');
		expect(source).toContain('This cannot be undone. Type');
		expect(source).toContain('<FilePath className="text-foreground" path={project.path} />');
		expect(source).toContain('className={fieldLabelClass}>Project path</div>');
		expect(source).not.toContain('proseMeasureClass');
		expect(source).not.toContain('label="Type the full project path to confirm"');
	});
});

describe('profile tab', () => {
	test('the sticky commit action and computed rail occupy separate columns', async () => {
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		expect(panel).not.toContain('Save profile');
		expect(panel).not.toContain('onSave');
		expect(panel).toContain('lg:sticky lg:top-[var(--app-topbar-height,0px)]');

		const tab = await detail('ProfileTab.tsx');
		expect(tab).toContain('Save profile');
		expect(tab).toContain('<div className="@container/editor flex flex-col gap-4">');
		expect(tab).toContain('@min-[40rem]/editor:columns-2');
		expect(tab).not.toContain('xl:grid-cols-2');

		const splitAt = tab.indexOf('@min-[68rem]/profile:grid-cols-[1.5fr_1fr]');
		const actionAt = tab.indexOf('<EditorActionBar');
		const desktopRailAt = tab.lastIndexOf('<ComputedProfilePanel');
		expect(actionAt).toBeGreaterThan(splitAt);
		expect(desktopRailAt).toBeGreaterThan(actionAt);
	});
});

describe('diary tab', () => {
	test('the page and feed keep the shared shell while chrome-owning children carry the measure', async () => {
		const tab = await detail('DiaryTab.tsx');
		expect(tab).not.toContain('width="full"');
		expect(tab).toContain('filterHeader={<TabIntro title="Diary" />}');
		expect(tab).not.toContain('contentRailClass');

		const feed = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryFeed.tsx'), 'utf8');
		// The route provides the page rail once, so cards, sticky rules, hover bands, filters, and
		// content inherit one edge.
		expect(feed).not.toContain('max-w-5xl');
		expect(feed).toContain('<div className="page-reveal max-w-[80rem] space-y-5">');
		expect(feed).toContain('border-t border-border');
		expect(feed).not.toContain('contentRailClass');
		const page = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryPage.tsx'), 'utf8');
		// /diary is on the same `page-reveal space-y-5` shell as every other page. Capped at a
		// centered max-w-5xl column it puts, at a 2321px viewport, a ~940px band of empty canvas
		// down both sides while sibling routes fill the shell.
		expect(page).toContain('page-reveal space-y-5');
		expect(page).not.toContain('max-w-5xl');
	});
});
