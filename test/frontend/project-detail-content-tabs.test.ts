import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
		expect(row).toContain('flex w-24 shrink-0 flex-wrap items-center gap-1.5');
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
