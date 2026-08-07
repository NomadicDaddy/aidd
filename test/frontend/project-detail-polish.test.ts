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
	test('are 1px, dimmed off the hovered path, and accent only on it', async () => {
		const source = await detail('dependencyGraphEdges.tsx');
		expect(source).toContain('strokeWidth={isSelectedEdge ? 2 : 1}');
		expect(source).toContain("'text-accent opacity-100'");
		expect(source).toContain("'text-border opacity-15'");
		expect(source).toContain("'text-border opacity-70'");
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

	test('the actions column is sized for what it holds', async () => {
		const source = await detail('FeaturesDesktopTable.tsx');

		// Actions had Milestone's 14% for up to five controls, and this cell is what sets the row
		// height. Below 1536 it was narrower than its own widest single control — 184px of `Approve
		// with decision` in 139px. At 2321 a backlog row goes 141px to 61px, waiting-approval 181
		// to 101, and the cell stops overflowing at 1280 and 1536.
		expect(source).toContain('<col className="w-[25%] 2xl:w-[28%]" />');
		expect(source).not.toContain('<col className="w-[14%]" />');

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
});

describe('code browser', () => {
	test('both panes take one viewport-derived height and scroll inside it', async () => {
		const shared = await detail('codeBrowserHeight.ts');
		expect(shared).toContain("export const codeBrowserHeightClass = 'lg:h-[calc(100vh-19rem)]");
		expect(shared).toContain('export const codeBrowserScrollerClass');

		const tab = await detail('CodeTab.tsx');
		expect(tab).toContain('codeBrowserHeightClass');

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
		expect(row).toContain('sm:flex-row sm:flex-wrap sm:items-center sm:justify-between');
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
			'ReportsTab.tsx',
			'RepositoryInfoCard.tsx',
			'ReportsTab.tsx',
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
	test('fills the shell like its sibling tabs while /diary keeps its reading column', async () => {
		const tab = await detail('DiaryTab.tsx');
		expect(tab).toContain('width="full"');

		const feed = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryFeed.tsx'), 'utf8');
		expect(feed).toContain("width = 'reading'");
		expect(feed).toContain("width === 'reading' && 'max-w-5xl'");

		const page = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryPage.tsx'), 'utf8');
		expect(page).not.toContain('width="full"');
	});
});
