import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { reportOriginLabel } from '../../frontend/src/pages/projects/detail/reportsUtils.ts';

const DETAIL_ROOT = join(process.cwd(), 'frontend', 'src', 'pages', 'projects', 'detail');
const FRONTEND_ROOT = join(process.cwd(), 'frontend', 'src');

function detail(file: string): Promise<string> {
	return Bun.file(join(DETAIL_ROOT, file)).text();
}

function frontend(...parts: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, ...parts)).text();
}

describe('Project Detail content and admin tabs polish', () => {
	test('keeps diary work in the filter surface and notes status beside the save action', async () => {
		const diary = await detail('DiaryTab.tsx');
		const notes = await detail('NotesTab.tsx');

		expect(diary).toContain('filterAction={');
		expect(diary).not.toContain('title="Today’s entry"');
		expect(notes).toContain('<span className="text-xs text-muted-foreground">{savedAt}</span>');
		expect(notes).toContain('aria-label="Rendered notes preview"');
		expect(notes).toContain('<MarkdownContent');
	});

	test('opens artifact rows from their full hover surface without moving group headings', async () => {
		const groups = await detail('ArtifactGroups.tsx');
		const row = await detail('ArtifactInventoryRow.tsx');
		const tab = await detail('ArtifactsTab.tsx');

		expect(groups).toContain('grid-flow-dense');
		expect(groups).toContain('[&[open]]:col-span-full');
		expect(groups).toContain("open={filter !== 'all' || group.id === defaultOpenGroupId}");
		// Group health stays based on the full inventory while the count reports the visible subset.
		expect(groups).toContain('fullGroupSummaries.get(group.id)');
		expect(groups).toContain('group.entries.length} of {group.total}');
		expect(groups).toContain('Filter artifact inventory');
		expect(tab).not.toContain('@min-[80rem]:grid-cols-2');
		expect(row).toContain('cursor-pointer');
		expect(row).toContain("closest('button')");
		expect(row).toContain('onOpen(viewerTarget)');
	});

	test('orders and filters unanswered interview work while keeping NICE quiet', async () => {
		const filters = await detail('InterviewFilters.tsx');
		const tab = await detail('InterviewTab.tsx');
		const utilities = await detail('interviewUtils.ts');

		expect(filters).toContain('placeholder="Filter question prompts"');
		expect(filters).toContain('label="Priority"');
		expect(tab).toContain('.toSorted((left, right) => {');
		expect(tab).toContain('interviewPriorityRank(normalizedInterviewPriority(left))');
		expect(utilities).toContain(
			"priority.trim().toUpperCase() === 'NICE' ? 'text-muted-foreground' : undefined",
		);
	});

	test('makes report identities and origins discoverable without fragile route decoding', async () => {
		const desktop = await detail('ReportsDesktopTable.tsx');
		const mobile = await detail('ReportsMobileList.tsx');

		expect(desktop).toContain('onSelectFeature(featureDirectory)');
		expect(desktop).toContain('touchTargetTextClass');
		expect(mobile).toContain('onSelectFeature(featureDirectory)');
		expect(reportOriginLabel('/projects/aidd/reports')).toBe('Projects › aidd › reports');
		expect(reportOriginLabel('/projects/%E0%A4%A/reports')).toBe(
			'Projects › %E0%A4%A › reports',
		);
	});

	test('keeps audit identity, actions, filters, and readable details in one toolbar surface', async () => {
		const compact = await detail('AuditCompactRow.tsx');
		const table = await detail('AuditsDesktopTable.tsx');
		const tab = await detail('AuditsTab.tsx');
		const mobile = await detail('AuditsMobileList.tsx');
		const content = await detail('auditRowContent.tsx');

		expect(tab).toContain('title="Audit inventory"');
		expect(tab).toContain('actions={');
		expect(tab).toContain('mobileLayout="inline"');
		expect(tab).toContain('shortcut');
		expect(tab).not.toContain('<Card>');
		expect(table).toContain('@min-[60rem]:block');
		expect(mobile).toContain('@min-[60rem]:hidden');
		expect(table).toContain('className="bg-muted py-3 pr-3 pl-12"');
		expect(compact).toContain('className="border-t border-border bg-muted p-3"');
		expect(content).toContain('${proseMeasureClass}');
		expect(content).not.toContain('max-w-[80ch]');
	});

	test('reveals deep-linked code rows and explains every search result', async () => {
		const results = await detail('CodeFileSearchResults.tsx');
		const tab = await detail('CodeTab.tsx');
		const tree = await detail('CodeFileTree.tsx');

		expect(tree).toContain('revealElementWithinScroller(scroller, selected, 28)');
		expect(results).toContain('function HighlightMatch');
		expect(results).toContain('languageExplainsMatch');
		expect(tab).toContain('text-xs text-muted-foreground tabular-nums');
		expect(tab).not.toContain('<Badge className="shrink-0" tone="neutral">');
	});

	test('keeps repository comparisons compact, honest, and hoverable', async () => {
		const card = await detail('RepositoryInfoCard.tsx');
		const table = await detail('workingTree/WorkingTreeTable.tsx');
		const workingTree = await detail('workingTree/WorkingTreeCard.tsx');

		expect(card).toContain('<RepositoryPanelHeading title="Snapshot" />');
		expect(card).toContain("data-scale={isLongTail ? 'long-tail' : 'linear'}");
		expect(card).toContain("isLongTail ? { width: '0.75rem' }");
		expect(table).toContain('w-full min-w-[640px] table-auto');
		expect(table).toContain('hover:bg-muted/40');
		expect(workingTree).toContain('`${selectedPaths.length} selected`');
	});

	test('aligns notes measures and keeps the stacked preview above the fold', async () => {
		const notes = await detail('NotesTab.tsx');
		expect(notes).toContain('@min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]');

		expect(notes).toContain('grid min-w-0 gap-5 text-sm');
		expect(notes).toContain('@min-[80rem]:grid-cols-[minmax(0,100ch)_minmax(0,1fr)]');
		expect(notes).toContain('min-h-[28rem] !max-w-none font-mono');
		expect(notes).toContain('@min-[80rem]:h-[var(--fill-height)]');
		expect(notes).toContain(
			'className="min-w-0 rounded-lg border border-border bg-muted/40 p-3 font-sans"',
		);
		// The preview is running prose in a card, so it takes the reading measure — stated at the
		// call site now that `measure` is required, which is why this is no longer one line.
		expect(notes).toContain('baseLevel={3}');
		expect(notes).toContain('className="mt-3"');
		expect(notes).toContain('markdown={draft}');
		expect(notes).toContain('measure="prose"');
		expect(notes).not.toContain('lg:h-[var(--fill-height)]');
	});

	test('keeps dependency positions stable and resting edges visible', async () => {
		const components = await detail('dependencyGraphComponents.tsx');
		const edges = await detail('dependencyGraphEdges.tsx');
		const tab = await detail('DependencyGraphTab.tsx');

		expect(edges).toContain('text-control-border');
		expect(edges).not.toContain('text-border opacity-100');
		expect(components).not.toContain('nodes on canvas');
		expect(components).toContain('links on canvas');
		expect(tab).toContain('@container min-w-0');
		expect(tab).toContain('@min-[100rem]:grid-cols-[minmax(0,1fr)_22rem]');
	});

	test('keeps diary headings above isolated rows and makes entries filterable', async () => {
		const bar = await frontend('pages', 'diary', 'DiaryFilterBar.tsx');
		const filters = await frontend('pages', 'diary', 'diaryFilters.ts');
		const list = await frontend('pages', 'diary', 'DiaryTimelineList.tsx');

		// The kind labels live beside the predicates in `diaryFilters`, so the segmented control
		// and the empty state's readout below it cannot spell one of them differently.
		expect(filters).toContain("entry: 'Entries'");
		expect(bar).toContain('DIARY_KINDS.map');
		expect(bar).toContain('<FilterToolbar');
		expect(bar).toContain('noun="loaded activities"');
		expect(filters).toContain("kind !== 'entry'");
		expect(list).toContain('relative isolate px-3 py-2');
	});

	test('makes report chips interactive, origins stable, and drafts recoverable', async () => {
		const dialog = await frontend('components', 'layout', 'ProjectReportDialog.tsx');
		const reports = await detail('ReportsDesktopTable.tsx');

		expect(reports).toContain('group-hover:bg-accent-muted');
		expect(reports).toContain('cursor-pointer truncate');
		expect(reports).toContain('decoration-dotted');
		expect(reports).not.toContain('text-xs break-all text-muted-foreground');
		expect(
			dialog.slice(dialog.indexOf('const close'), dialog.indexOf('const submit')),
		).not.toContain('reset()');
		expect(dialog).toContain('reset();\n\t\t\t\t\tonClose();');
	});

	test('bounds history affordances to content that actually acts', async () => {
		const history = await detail('HistoryTab.tsx');

		expect(history).not.toContain('tableMeasureClass');
		expect(history).not.toContain('hover:bg-muted/60');
	});

	test('compares profile previews with the saved baseline and exposes keyboard focus', async () => {
		const facet = await detail('profile/FacetCard.tsx');
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		const tab = await detail('ProfileTab.tsx');

		expect(tab).toContain('const savedPreview = useProfilePreview(projectId, savedInput)');
		expect(tab).toContain('savedPreview={savedPreview.data}');
		expect(panel).toContain('savedApplicable.length}→${applicable.length} apply');
		expect(panel).toContain('{changed ? <StatusDot tone="amber" /> : null}');
		expect(facet).toContain('has-[:focus-visible]:ring-2');
		expect(tab).toContain('<Card className={proseMeasureCardClass}>');
		expect(tab).toContain('className={`${textareaClass} min-h-40`}');
	});

	test('reserves danger styling for directory deletion and pairs the demanded path with it', async () => {
		const deletion = await detail('DeleteProjectCard.tsx');
		const management = await detail('ManagementTab.tsx');
		const rename = await detail('RenameProjectCard.tsx');

		expect(management).toContain('@min-[61rem]:grid-cols-2');
		expect(management).toContain('@min-[100rem]:grid-cols-3');
		expect(deletion).toContain("deleteMode === 'directory' && toneSurface.red");
		expect(deletion).toContain('className={fieldLabelClass}>Project path</div>');
		expect(deletion).toContain('Deletes the project directory and everything under it.');
		expect(deletion).toContain('This cannot be undone.');
		expect(rename).toContain('Enter a name different from the current one.');
	});
});
