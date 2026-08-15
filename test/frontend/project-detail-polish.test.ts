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

		expect(edges).toContain('strokeWidth={isSelectedEdge ? 2 : 1}');
		expect(edges).toContain("'text-accent opacity-100'");
		expect(edges).toContain("'text-border opacity-15'");
		expect(edges).toContain("'text-border opacity-100'");
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
		expect(styles).toMatch(/button:focus-visible,[\s\S]*outline: 2px solid var\(--ring\)/u);
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

	test('a feature row offers at most one filled primary', async () => {
		const source = await detail('FeatureActionVariants.tsx');
		// `Approve with decision` sat beside `Approve` as a second filled primary, so the row put
		// two equal-weight calls to action next to a destructive one.
		// Matched loosely on whitespace: the button is nested a level deeper now that it shares a
		// row with the decision field, and the tone is the assertion — not the indentation.
		expect(source).toMatch(/title="Approve with decision"\s+variant="secondary">/u);
	});

	test('the status select shares its line instead of claiming one', async () => {
		const source = await detail('FeatureActionVariants.tsx');

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
		const tab = await detail('FeaturesTab.tsx');

		expect(source).toContain('hidden @min-[61rem]:block');
		expect(tab).toContain('@min-[61rem]:hidden');
		expect(tab).toContain('<EmptyState>No features match the active filters.</EmptyState>');
		expect(cards).not.toContain('>Passes</dt>');
		const quietControl = controls.slice(
			controls.indexOf('const quietSelectClass'),
			controls.indexOf('export function FeatureMilestoneControl'),
		);
		expect(quietControl).toContain('max-w-full');
		expect(quietControl).not.toContain('max-w-44');

		// Actions had Milestone's 14% for up to five controls, and this cell is what sets the row
		// height. Below 1536 it was narrower than its own widest single control — 184px of `Approve
		// with decision` in 139px. At 2321 a backlog row goes 141px to 61px, waiting-approval 181
		// to 101, and the cell stops overflowing at 1280 and 1536.
		expect(source).not.toContain('<col className="w-[14%]" />');

		// The widest tier holds the action track at the roughly 400px backlog action group plus cell
		// padding. Feature receives the automatic remainder instead of letting Actions grow forever.
		expect(source).toContain('<col className="w-[28%] 2xl:w-[29%] @min-[100rem]:w-auto" />');
		expect(source).toContain('<col className="w-[8%] 2xl:w-[11%]" />');
		expect(source).toContain('<col className="w-[25%] 2xl:w-[24%] @min-[100rem]:w-[27rem]" />');

		// The second tier is not cosmetic. Shipped and Priority are floored by their own
		// single-word uppercase headers — 68px and 72px, unwrappable — so 6% and 7% buy width
		// against a 2031px table and starve the header against a 990px one.
		expect(source).toContain('<col className="w-[8%] 2xl:w-[6%]" />');
		expect(source).toContain('<col className="w-[8%] 2xl:w-[7%]" />');

		// Status keeps its 11%. That cell is already 19px short of a `waiting_approval` badge at
		// 1280, and paying for Actions out of it would deepen a defect this change is not fixing.
		expect(source).toContain('<col className="w-[11%]" />');
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
		expect(refs.match(/font-mono/gu)?.length ?? 0).toBeGreaterThanOrEqual(6);

		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).toContain('<Stat label="Current branch" mono value={info.currentBranch} />');
		expect(info).toContain("mono ? 'font-mono break-all' : 'tabular-nums'");
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
		expect(refs).toContain('level="subsection"');
		expect(refs).not.toContain('<h4');
	});

	test('the statistics panel keeps a measure the eye can cross', async () => {
		// Uncapped, `Current branch` sat at x=555 and `main` at x=2170 on a 2250 viewport, and the
		// language bars stretched onto a ~1470px track where the third language was a 1px stub.
		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).toContain('xl:max-w-[48rem]');
	});
});

describe('run tables', () => {
	test('the tables that fill a card take the shared table measure', async () => {
		for (const file of ['ProjectUsagePanel.tsx', 'ActiveRunsPanel.tsx']) {
			const source = await detail(file);
			expect(source).toContain('tableMeasureClass');
		}

		// A cap, not a width: `w-full` still comes first so the table fills a narrower card.
		const usage = await detail('ProjectUsagePanel.tsx');
		expect(usage).toContain('className={`w-full text-left text-sm ${tableMeasureClass}`}');

		// One declaration, in the file that owns table furniture. It was briefly declared a
		// second time in lib/typography.ts, which is the same drift the constant exists to stop.
		const tableStyles = await src('lib/tableStyles.ts');
		expect(tableStyles).toContain("export const tableMeasureClass = 'max-w-[80rem]'");

		const typography = await src('lib/typography.ts');
		expect(typography).not.toContain('tableMeasureClass');
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
			expect(source).toContain('focus-visible:ring-ring/50');
			expect(source).toContain('focus-visible:ring-offset-2');
			expect(source).toContain('focus-visible:ring-offset-background');
			expect(source).not.toContain('ring-ring/40');
		}

		expect(tab).toContain('? `${matchingFileCount.toLocaleString()} results`');
		expect(tab).toContain(': `${files.length.toLocaleString()} files`}');
		expect(viewer).toContain('text-xs leading-relaxed');
		expect(viewer).toContain('icons/clipboard-copy');
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
		expect(shared).toContain("'@min-[61rem]:h-[calc(100vh-19rem)] @min-[61rem]:min-h-[28rem]'");
		expect(shared).toContain('export const codeBrowserScrollerClass');

		// The gate is the card's width, not the window's: with the rail expanded the content column
		// is about 992px at a 1024 viewport, so `lg:` split the browser in two roughly 32px before
		// the card had room for it, and un-split it when the rail collapsed at the same viewport.
		expect(shared).not.toContain("'lg:");

		const tab = await detail('CodeTab.tsx');
		expect(tab).toContain('codeBrowserHeightClass');
		expect(tab).toContain('<Card className="@container overflow-hidden p-0">');
		expect(tab).not.toContain('lg:grid-cols-');

		// Two tree widths. 22rem truncates a nested route path; at 2250 the card has the room to
		// give the names 30rem and still leave the viewer more measure than source lines use.
		expect(tab).toContain('@min-[61rem]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]');
		expect(tab).toContain('@min-[100rem]:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]');

		for (const file of ['CodeFileTree.tsx', 'CodeFileViewer.tsx']) {
			const source = await detail(file);
			expect(source).toContain('codeBrowserScrollerClass');
			// The old per-pane caps: 34rem on the tree, 42rem on the viewer, 128px apart.
			expect(source).not.toContain('max-h-[34rem]');
			expect(source).not.toContain('max-h-[42rem]');
		}
	});
});

describe('artifact inventory', () => {
	test('both inventories render one row component under one type rule', async () => {
		const row = await detail('ArtifactInventoryRow.tsx');
		expect(row).toContain('function labelAddsNothing');
		expect(row).toContain('truncate font-mono text-sm text-foreground');
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
		expect(row).toContain('sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center');
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

		expect(metadata).toContain('grid gap-4 lg:grid-cols-2');
		expect(summary).toContain('grid gap-4 lg:grid-cols-3');
	});
});

describe('relative age', () => {
	test('is one component with the exact stamp in the tooltip', async () => {
		const component = await src('components/shared/RelativeAge.tsx');
		expect(component).toContain('<time');
		expect(component).toContain('title={formatDate(value)}');
		expect(component).toContain('dateTime=');
	});

	test('project-detail surfaces use it rather than their own spelling', async () => {
		const users = [
			'ArtifactInventoryRow.tsx',
			'ArtifactViewerDialog.tsx',
			'ArtifactsTab.tsx',
			'HistoryTab.tsx',
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

describe('management tab', () => {
	test('the destructive card is legible as destructive at the card level', async () => {
		const source = await detail('DeleteProjectCard.tsx');
		expect(source).toContain('toneBorder.red');
		expect(source).toContain('toneSurface.red');
	});
});

describe('profile tab', () => {
	test('the commit action sits below the fields it commits', async () => {
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		expect(panel).not.toContain('Save profile');
		expect(panel).not.toContain('onSave');

		const tab = await detail('ProfileTab.tsx');
		expect(tab).toContain('Save profile');
		const saveAt = tab.indexOf('Save profile');
		const railAt = tab.indexOf('<ComputedProfilePanel');
		// Below the fields means after them in the column, and the rail no longer carries it.
		expect(saveAt).toBeGreaterThan(tab.indexOf('NotesCard'));
		expect(railAt).toBeGreaterThan(saveAt);
	});
});

describe('diary tab', () => {
	test('the page and feed keep the shared shell while chrome-owning children carry the measure', async () => {
		const tab = await detail('DiaryTab.tsx');
		expect(tab).not.toContain('width="full"');

		const feed = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryFeed.tsx'), 'utf8');
		// The route and feed keep the full-width page shell, while each chrome-owning child carries the
		// established measure so cards, sticky rules, hover bands, filters, and content share an edge.
		expect(feed).not.toContain('max-w-5xl');
		expect(feed).toContain('<div className="space-y-5">');
		expect(feed).toContain('max-w-[61rem] border-t border-border');

		const page = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryPage.tsx'), 'utf8');
		// /diary is on the same `page-reveal space-y-5` shell as every other page. It used to cap
		// itself at a centered max-w-5xl column, which at the reporter's 2321px viewport put a
		// ~940px band of empty canvas down both sides while sibling routes filled the shell.
		expect(page).toContain('page-reveal space-y-5');
		expect(page).not.toContain('max-w-5xl');
	});
});
