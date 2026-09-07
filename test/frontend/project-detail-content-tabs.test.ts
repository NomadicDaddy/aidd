import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { activeAuditFindings } from '../../frontend/src/pages/projects/detail/auditsTabUtils.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

const src = (file: string) => readFile(resolve(FRONTEND_SRC, file), 'utf8');
const detail = (file: string) => src(`pages/projects/detail/${file}`);

describe('artifacts tab', () => {
	test('the inventory caption and its group headings sit one declared step apart', async () => {
		// Both were local copies of the same utilities, so `ARTIFACT INVENTORY (56)` and
		// `SPECIFIED (3)` directly under it computed identically and the sections were invisible.
		const tab = await detail('ArtifactsTab.tsx');
		expect(tab).toContain('title={`Artifact inventory (${visibleInventoryCount}');
		expect(tab).toContain('id="artifact-health-heading"');
		expect(tab).not.toContain('text-xs font-semibold tracking-wide text-muted-foreground');

		const groups = await detail('ArtifactGroups.tsx');
		expect(groups).toContain('microLabelClass');
		expect(groups).not.toContain('text-xs font-semibold tracking-wide text-muted-foreground');
	});

	test('the two header facts are an inline pair, not a two-column grid', async () => {
		// `sm:grid-cols-2` put the second of two short strings on the midpoint of a 1928px card.
		const tab = await detail('ArtifactsTab.tsx');
		expect(tab).toContain('flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground');
		expect(tab).not.toContain('mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2');
	});

	test('long artifact groups stay in page flow instead of nesting a fixed-height scrollport', async () => {
		const groups = await detail('ArtifactGroups.tsx');

		expect(groups).not.toContain('<OverflowScroller');
		expect(groups).not.toContain('max-h-[28rem]');
		expect(groups).toContain('group.entries.map');
	});
});

describe('interview tab', () => {
	test('the compact progress summary carries composition without duplicate metric tiles', async () => {
		const tab = await detail('InterviewTab.tsx');
		expect(tab).toContain('<span>{interviewPriorityComposition(allQuestions)}</span>');
		expect(tab).toContain('{interview.answered}/{interview.total} answered');
		expect(tab).toContain('role="progressbar"');
		expect(tab).not.toContain('<Metric');
		expect(tab).not.toContain('`${criticalOrHigh}/${remaining} critical or high priority`');
		expect(tab).not.toContain('detail="In this interview"');
		expect(tab).not.toContain('detail="Answered"');
		expect(tab).not.toContain('detail="Outstanding"');
	});

	test('every collapsed prompt starts at the same x', async () => {
		// Sharing one wrapping flex line with the priority badge, the prompt's left edge moved with
		// the badge's word — four x-origins in the first eight rows — and a prompt with no room left
		// dropped below the badge, so one list held 44px, 72px and 92px rows.
		const row = await detail('InterviewQuestionRow.tsx');
		expect(row).toContain('sm:w-24 sm:shrink-0');
		expect(row).toContain('min-w-0 flex-1 leading-normal text-foreground');
		expect(row.match(/<MarkdownContent/gu)).toHaveLength(2);
		expect(row).not.toContain('flex w-full flex-wrap items-center gap-2 rounded-md');
	});
});

describe('notes tab', () => {
	test('reports the server-owned character limit before an oversized save', async () => {
		const tab = await detail('NotesTab.tsx');

		expect(tab).toContain('draftLength > projectNotesMaxLength');
		expect(tab).toContain('aria-describedby={lengthHelpId}');
		expect(tab).toContain('aria-invalid={overLimit || undefined}');
		expect(tab).toContain('disabled={!dirty || saveNotes.isPending || overLimit}');
		expect(tab).toContain('Notes are ${formatCount(draftLength)} characters; the limit is');
		expect(tab).not.toContain('error instanceof Error ? error.message');
	});

	test('the editor fills the measured viewport remainder and keeps its preview visible when stacked', async () => {
		// The 28rem stacked floor keeps the editor useful while the wide two-column layout still
		// the wide two-column layout still fills the measured viewport remainder.
		const tab = await detail('NotesTab.tsx');
		expect(tab).toContain('projectDetailViewportGutterPx');
		expect(tab).not.toContain('minHeightPx');
		expect(tab).toContain('refreshKey: notes.data');
		expect(tab).toContain(
			'min-h-[28rem] !max-w-none font-mono @min-[80rem]:h-[var(--fill-height)] @min-[80rem]:min-h-0',
		);
		expect(tab).toContain('ref={editorRef}');
		expect(tab).not.toContain('calc(100vh-');
	});
});

describe('tab headers', () => {
	test('a tab opens with a bare title, on every tab', async () => {
		// Code and Notes were the only two of seventeen carrying a header icon, so their titles
		// started about 22px right of their neighbours' and picked up a teal mark that said nothing
		// the word did not. Icons stay on the cards inside a tab that are saying something else.
		for (const file of ['CodeTab.tsx', 'NotesTab.tsx']) {
			const tab = await detail(file);
			expect(tab).not.toContain('icon={');
		}
	});
});

describe('reports tab', () => {
	test('the kind filter sits in a card, like the header on the tab beside it', async () => {
		const tab = await detail('ReportsTab.tsx');
		expect(tab).toContain('<FilterToolbar');
		expect(tab).toContain('noun="reports"');
		expect(tab).not.toContain('rail="full"');
	});

	test('desktop report identities stay within two lines and retain their full text', async () => {
		// Descriptions get two table lines while discoverable tooltips retain complete values.
		const table = await detail('ReportsDesktopTable.tsx');
		expect(table).toContain('line-clamp-2 font-medium text-foreground');
		expect(table).toContain('truncate font-mono text-xs text-muted-foreground');
		expect(table).toContain('<Tooltip content={report.description}>');
		expect(table).toContain('<Tooltip content={identifier}>');

		const list = await detail('ReportsMobileList.tsx');
		expect(list).toContain('mt-3 max-w-[70ch] text-sm whitespace-pre-wrap text-foreground');
	});

	test('the desktop report table keeps both axes inside one measured scrollport', async () => {
		const table = await detail('ReportsDesktopTable.tsx');

		expect(table).toContain('<OverflowScroller');
		expect(table).toContain('ariaLabel="Project reports"');
		expect(table).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(table).toContain('rootRef={tableRef}');
		expect(table).toContain('refreshKey: reports');
		expect(table).not.toContain('minHeightPx: 0');
		expect(table).not.toContain('calc(100dvh-');
	});
});

describe('audits tab', () => {
	test('the row override select sizes to its options, not to its column', async () => {
		// Three options whose longest is one word were painted as a 225px chevron box, 42 rows deep.
		const table = await detail('AuditsDesktopTable.tsx');
		expect(table).not.toContain('${selectClass} w-full');
	});

	test('both row variants share the same keyboard-reachable audit path', async () => {
		const table = await detail('AuditsDesktopTable.tsx');
		const list = await detail('AuditCompactRow.tsx');
		const content = await detail('auditRowContent.tsx');
		expect(table).toContain('<AuditPath entry={entry} />');
		expect(list).toContain('<AuditPath entry={row} />');
		expect(content).toContain('<Tooltip content={entry.path}>');
	});

	test('uses one container threshold and equivalent row affordances in both variants', async () => {
		const table = await detail('AuditsDesktopTable.tsx');
		const list = await detail('AuditsMobileList.tsx');
		const row = await detail('AuditCompactRow.tsx');
		const content = await detail('auditRowContent.tsx');

		expect(table).toContain('hidden p-0 @min-[60rem]:block');
		expect(list).toContain('className="@min-[60rem]:hidden"');
		expect(table).toContain('<OverflowScroller');
		expect(table).toContain('className="hidden @min-[60rem]:block"');
		expect(table).toContain('filterReset="toolbar"');
		expect(table).toContain('filters={emptyFilters}');
		expect(list).toContain('className="@min-[60rem]:hidden"');
		expect(list).toContain('filterReset="toolbar"');
		expect(list).toContain('filters={emptyFilters}');
		expect(table).toContain('<AuditDetailsToggle');
		expect(row).toContain('<AuditDetailsToggle');
		expect(table).toContain('<AuditActionButton');
		expect(row).toContain('<AuditActionButton');
		expect(content).toContain('size="compact"');
		expect(table).not.toContain('title=');
	});

	test('keeps both desktop inventories in measured viewport scrollports', async () => {
		const audits = await detail('AuditsDesktopTable.tsx');
		const reports = await detail('ReportsDesktopTable.tsx');

		expect(audits).toContain('gutterPx: projectDetailViewportGutterPx');
		expect(audits).not.toContain('minHeightPx: 0');
		expect(audits).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(audits).toContain('ref={tableRef}');
		expect(audits).toContain('refreshKey: rows');
		expect(reports).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(reports).toContain('rootRef={tableRef}');
		expect(reports).not.toContain('minHeightPx: 0');
	});

	test('matches only active findings from the row audit', () => {
		const findings = activeAuditFindings(
			[
				{ auditSource: 'SECURITY', id: 'one', status: 'backlog' },
				{ auditSource: 'SECURITY', id: 'done', status: 'completed' },
				{ auditSource: 'SECURITY', id: 'passing', passes: true, status: 'backlog' },
				{ id: 'audit-composition-patterns-1234-convention', status: 'in_progress' },
				{ auditSource: 'HYGIENE', id: 'other', status: 'backlog' },
			],
			'SECURITY',
		);

		expect(findings.map((finding) => finding.id)).toEqual(['one']);
		expect(
			activeAuditFindings(
				[{ id: 'audit-composition-patterns-1234-convention', status: 'in_progress' }],
				'COMPOSITION_PATTERNS',
			).map((finding) => finding.id),
		).toEqual(['audit-composition-patterns-1234-convention']);
	});
});

describe('milestones tab', () => {
	test('the desktop table keeps its named scroll region', async () => {
		const table = await detail('MilestonesTable.tsx');

		expect(table).toContain('<OverflowScroller ariaLabel="Project milestones"');
	});
});

describe('profile tab', () => {
	test('every group title on the form is a heading, at one rank', async () => {
		// An interactive snapshot returned three headings for a page carrying nine card titles.
		const facet = await detail('profile/FacetCard.tsx');
		expect(facet).toContain('<legend className="sr-only">');
		expect(facet).toContain('headingLevel={3}');

		const tab = await detail('ProfileTab.tsx');
		expect(tab).toContain('title="Notes"');
		expect(tab).toContain('<label className="sr-only" htmlFor="profile-notes">');
	});

	test('an audit name and its effect chip stay adjacent', async () => {
		// A flexible name spacer distributed a 161px name and a 63px badge across the full rail.
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		expect(panel).toContain('flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted');
		expect(panel).toContain(
			'max-w-full min-w-0 font-mono text-sm font-medium [overflow-wrap:anywhere]',
		);
		expect(panel).not.toContain('min-w-0 flex-1 truncate text-sm');
	});
});

describe('management tab', () => {
	test('the two tall cards share a row', async () => {
		// In file order the 130px Re-run intake card left 142px of dead space beside the 272px
		// Rename, and Delete left 74px beside Move.
		const tab = await detail('ManagementTab.tsx');
		const order = [
			'<RenameProjectCard',
			'<MoveProjectCard',
			'<ReintakeCard',
			'<DeleteProjectCard',
		];
		const positions = order.map((card) => tab.indexOf(card));
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(positions.every((at) => at > 0)).toBe(true);
	});
});

describe('diary surfaces', () => {
	test('one declared reading measure, not the built-in prose width', async () => {
		// The tab intro wrapped near 603px while the diary prose below it wrapped near 631px.
		// The diary now routes that prose through TabIntro, whose shared implementation owns the
		// one declared reading measure.
		const tab = await detail('DiaryTab.tsx');
		const intro = await src('components/shared/TabIntro.tsx');
		expect(tab).toContain('<TabIntro');
		expect(intro).toContain('proseMeasureClass');
		expect(tab).not.toContain('className="block max-w-prose');
	});

	test('the filter toolbar keeps its two control groups inside one scan', async () => {
		// The filter Card owns the measure so its chrome and both control groups end together.
		const bar = await src('pages/diary/DiaryFilterBar.tsx');
		const feed = await src('pages/diary/DiaryFeed.tsx');
		expect(feed).toContain('<div className="page-reveal max-w-[80rem] space-y-5">');
		expect(bar).toContain('<FilterToolbar');
		expect(bar).toContain('noun="loaded activities"');
		expect(bar).not.toContain('contentRailClass');
		expect(bar).toContain('actions={action}');
		expect(bar).toContain('primaryControlCount={2}');
		expect(bar).not.toContain('<Card className="flex flex-wrap items-center justify-between');
	});
});
