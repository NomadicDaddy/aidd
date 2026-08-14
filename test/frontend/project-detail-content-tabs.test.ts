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
		expect(tab).toContain('sectionCaptionClass');
		expect(tab).not.toContain('text-xs font-semibold tracking-wide text-muted-foreground');

		const groups = await detail('ArtifactGroups.tsx');
		expect(groups).toContain('microLabelClass');
		expect(groups).not.toContain('text-xs font-semibold tracking-wide text-muted-foreground');
	});

	test('the two header facts are an inline pair, not a two-column grid', async () => {
		// `sm:grid-cols-2` put the second of two short strings on the midpoint of a 1928px card.
		const tab = await detail('ArtifactsTab.tsx');
		expect(tab).toContain('mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground');
		expect(tab).not.toContain('mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2');
	});
});

describe('interview tab', () => {
	test('the metric tiles carry a detail line like the artifacts row', async () => {
		const tab = await detail('InterviewTab.tsx');
		for (const detailText of ['In this interview', 'Answered', 'Outstanding']) {
			expect(tab).toContain(`detail="${detailText}"`);
		}
	});

	test('every collapsed prompt starts at the same x', async () => {
		// Sharing one wrapping flex line with the priority badge, the prompt's left edge moved with
		// the badge's word — four x-origins in the first eight rows — and a prompt with no room left
		// dropped below the badge, so one list held 44px, 72px and 92px rows.
		const row = await detail('InterviewQuestionRow.tsx');
		expect(row).toContain('sm:w-24 sm:shrink-0');
		expect(row).toContain('min-w-0 flex-1 text-sm text-foreground');
		expect(row).not.toContain('flex w-full flex-wrap items-center gap-2 rounded-md');
	});
});

describe('notes tab', () => {
	test('the editor grows with the window and keeps 28rem as its floor', async () => {
		// A fixed 28rem left the one surface whose purpose is a long block of text showing 448px of
		// it inside a 1309px viewport, with 500px of empty card below.
		const tab = await detail('NotesTab.tsx');
		expect(tab).toContain('min-h-[28rem] font-mono lg:h-[calc(100vh-25rem)]');
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
		expect(tab).toContain('<Card>\n\t\t\t\t<CardHeader');
	});

	test('a description is clamped in both halves, with the full text reachable', async () => {
		// The longest in the corpus runs 280 characters, and uncapped it set the height of its row.
		const table = await detail('ReportsDesktopTable.tsx');
		expect(table).toContain('line-clamp-2 whitespace-pre-wrap');
		expect(table).toContain('title={report.description}');

		const list = await detail('ReportsMobileList.tsx');
		expect(list).toContain('mt-3 max-w-[70ch] text-sm whitespace-pre-wrap text-foreground');
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

		expect(table).toContain('hidden p-0 @min-[80rem]:block');
		expect(list).toContain('className="@min-[80rem]:hidden"');
		expect(table).toContain('<OverflowScroller');
		expect(table).toContain('<EmptyState className="hidden @min-[80rem]:block">');
		expect(list).toContain('<EmptyState className="@min-[80rem]:hidden">');
		expect(table).toContain('<AuditDetailsToggle');
		expect(row).toContain('<AuditDetailsToggle');
		expect(table).toContain('<AuditActionButton');
		expect(row).toContain('<AuditActionButton');
		expect(content).toContain('size="compact"');
		expect(table).not.toContain('title=');
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
		// Distributed, a 161px name and a 63px badge left 505px between them on a 737px row.
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		expect(panel).toContain('flex items-center gap-2 rounded px-1 py-0.5');
		expect(panel).toContain('min-w-0 flex-1 truncate text-sm');
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
		// Matched on the class as it was applied, since the source comment names what it replaced.
		const tab = await detail('DiaryTab.tsx');
		expect(tab).toContain('proseMeasureClass');
		expect(tab).not.toContain('className="block max-w-prose');
	});

	test('the filter toolbar keeps its two control groups inside one scan', async () => {
		// Justified against the raw column at 2250, the kind control ended near x=660 and the count
		// and time window did not begin until x=1924.
		const bar = await src('pages/diary/DiaryFilterBar.tsx');
		expect(bar).toContain('flex max-w-[61rem] flex-wrap items-center justify-between gap-3');
		expect(bar).not.toContain('<Card className="flex flex-wrap items-center justify-between');
	});
});
