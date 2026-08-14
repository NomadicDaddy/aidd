import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');
const pagesRoot = join(frontendRoot, 'pages');

function source(...segments: string[]): Promise<string> {
	return Bun.file(join(pagesRoot, ...segments)).text();
}

// The two ways a panel is allowed to name itself. `CardHeader` when the header carries controls or
// titles a card; `TabIntro` when all the header had was the tab's own label and a sentence, where
// the box around it was the whole cost.
function declaresHeader(text: string): boolean {
	return text.includes('<CardHeader') || text.includes('<TabIntro');
}

// A section header is a heading that titles a card or a page section. Dialog titles, list-item
// titles and the small uppercase field-group labels are not section headers and are not in scope —
// so the scan looks for the two typographic ranks CardHeader owns rather than for every `<h2>`.
const sectionHeadingClass =
	/<h[23][^>]*className="[^"]*text-(?:base|sm|lg) font-semibold text-foreground/;

// Files that carry a heading at a CardHeader rank for a reason other than titling a card section.
// Every entry is a claim that CardHeader would be the wrong component there, not merely awkward.
const exemptions: { file: string; why: string }[] = [
	{ file: 'diary/DiaryEntryCard.tsx', why: 'list-item title inside a feed row, not a section' },
	{ file: 'director/DirectorChatSection.tsx', why: 'label for the session rail, not a section' },
	// The launch-preview dialog moved out of DirectorSuggestions.tsx when the queue rows changed
	// shape and pushed the module past the per-file line cap; its title went with it. What is left
	// in the queue file is the per-row title, which is a list item and not a section either.
	{ file: 'director/DirectorSuggestions.tsx', why: 'per-suggestion row title inside a list' },
	{
		file: 'director/SuggestionLaunchPreviewDialog.tsx',
		why: 'dialog title, owned by DialogPanel',
	},
	// `pipelineSessions/StepRows.tsx` was exempt as a "per-step row title inside a list". Each
	// executed step is a sunken Card carrying a badge rail, a title, a timestamp line and an "Open in
	// Live Console" action — CardHeader's slot set exactly — and hand-rolling it is what let twelve
	// step titles render at the same rank as the one card title above them. Both rows use CardHeader
	// at `level="subsection"` now, so the file is scanned like the rest.
	// `projects/ProjectCard.tsx` was exempt as a "catalog card title". It is a card with a title, a
	// mono path, a stage line and a ring-plus-badge rail — CardHeader's slot set exactly — and
	// hand-rolling it is what let the path render `break-all` while every other card identifier in
	// the app truncates. It uses CardHeader now. The mobile profile-matrix row below stays exempt:
	// it is a row identity in a stack of rows, which is a different thing.
	{
		file: 'projects/profileMatrix/ProfileMatrixMobileList.tsx',
		why: 'the same catalog card title one viewport narrower: it is the row identity in a stack of rows, not a section of one card',
	},
	{
		file: 'projects/detail/CodeFileViewer.tsx',
		why: 'file path of the open file, not a section',
	},
	{ file: 'projects/detail/MilestoneFormDialog.tsx', why: 'dialog title' },
	{ file: 'projects/detail/MilestonePlanDialog.tsx', why: 'dialog title' },
	{ file: 'projects/detail/FeatureDetailsDialog.tsx', why: 'dialog title' },
	{
		file: 'projects/detail/ArtifactViewerDialog.tsx',
		why: 'dialog title and markdown renderers',
	},
	{
		file: 'projects/detail/dependencyGraphPanels.tsx',
		why: 'selected-node title in a side panel',
	},
	{ file: 'projects/detail/workingTree/CommitMessageDialog.tsx', why: 'dialog title' },
	// The two launch panels were exempted as "launch drawer titles". Neither is a drawer: both are
	// in-flow cards with a title, a step-count description and a Close action — CardHeader's exact
	// slot set — and both now use it.
	// `recipes/StepOverviewCard.tsx` was exempt as a "per-step row title inside a list". It is not a
	// row: it is a card with a title, a mono step id and three badges, which is CardHeader's slot set
	// exactly, and hand-rolling it meant the step id rendered in a different place and face than the
	// same id does on every other surface. It uses CardHeader now, so it is scanned like the rest.
	{ file: 'settings/ExecutionIdentityBadgeLabPage.tsx', why: 'per-example label in a grid' },
	{ file: 'skills/SkillImportDialog.tsx', why: 'dialog title, wired to aria-labelledby' },
	{ file: 'diary/DiaryFeed.tsx', why: 'sticky day divider in a chronological feed' },
	{ file: 'dashboard/DirectorQueueCard.tsx', why: 'per-suggestion row title inside a list' },
	// The privacy card's four disclosure items are grid cells inside one card, under that card's own
	// CardHeader. There is no card for CardHeader to title here, and giving each item one would put
	// four card headers inside a single card.
	{
		file: 'telemetry/TelemetryDisclosure.tsx',
		why: 'item title inside the disclosure grid of one card, under that card CardHeader',
	},
];

describe('CardHeader adoption', () => {
	test('no page hand-rolls a section header', async () => {
		const exempt = new Set(exemptions.map((entry) => entry.file));
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: pagesRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			if (exempt.has(path)) continue;
			const text = await Bun.file(join(pagesRoot, file)).text();
			for (const [index, line] of text.split('\n').entries()) {
				if (sectionHeadingClass.test(line)) offenders.push(`${path}:${index + 1}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('declares the slot set the call sites need', async () => {
		const card = await Bun.file(join(frontendRoot, 'components', 'ui', 'card.tsx')).text();
		for (const slot of ['action?:', 'badge?:', 'description?:', 'icon?:', 'identifier?:']) {
			expect(card).toContain(slot);
		}
		// `identifier` is the slot whose absence made Recipes and Skills hand-roll their headers:
		// a mono id line under the title, which nothing else in the header set could express.
		expect(card).toContain('"mt-1 truncate font-mono text-xs text-muted-foreground"');
	});

	test('separates the semantic heading level from the visual rank', async () => {
		const card = await Bun.file(join(frontendRoot, 'components', 'ui', 'card.tsx')).text();
		// A nested card must be able to emit `h3` under an `h2` and still look like a section, so
		// the two props are independent and neither derives from the other.
		expect(card).toContain('headingLevel?: 2 | 3 | 4 | 5 | 6');
		expect(card).toContain('level?: keyof typeof headerLevels');
		expect(card).toContain("section: 'text-base font-semibold text-foreground'");
		expect(card).toContain("subsection: 'text-sm font-semibold text-foreground'");
		expect(card).not.toMatch(/level = .*headingLevel/);
	});

	test('leaves Director and Settings no second declaration of the header scale', async () => {
		const utils = await source('director', 'directorUtils.ts');
		expect(utils).not.toContain('export const sectionTitleClass');
		expect(utils).not.toContain('export const sectionDescClass');

		// The left-rail variant put the Run Limits titles in a 12rem column beside their controls —
		// the only header on the Settings surface that sat next to what it described.
		const runLimits = await source('settings', 'RunLimitsSection.tsx');
		expect(runLimits).not.toContain('lg:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1.35fr)]');
		expect(runLimits).toContain('<CardHeader description={description} title={title} />');
	});

	test('opens every Project Detail tab with the same header shape', async () => {
		const glob = new Bun.Glob('*Tab.tsx');
		const tabRoot = join(pagesRoot, 'projects', 'detail');
		const missing: string[] = [];
		for await (const file of glob.scan({ absolute: false, cwd: tabRoot, onlyFiles: true })) {
			const text = await Bun.file(join(tabRoot, file)).text();
			if (declaresHeader(text)) continue;
			// A tab that composes sibling panels declares no header of its own — Runs is three
			// panels, each carrying the house header for its own card. Follow one level of local
			// imports rather than reading the absence as a missing header.
			const siblings = [...text.matchAll(/from '\.\/([A-Za-z]+\.tsx)'/g)].flatMap((match) =>
				match[1] === undefined ? [] : [match[1]],
			);
			const headers = await Promise.all(
				siblings.map((sibling) => Bun.file(join(tabRoot, sibling)).text()),
			);
			if (!headers.some(declaresHeader)) missing.push(file);
		}
		// Overview lives on the page rather than in a *Tab.tsx file, so it is checked separately.
		expect(missing).toEqual([]);
		const page = await source('projects', 'ProjectDetailPage.tsx');
		expect(page).toContain('<TabIntro');
		expect(page).toContain('title="Overview"');
	});

	test('the tab intro names its panel without drawing a box around the name', async () => {
		const intro = await Bun.file(
			join(frontendRoot, 'components', 'shared', 'TabIntro.tsx'),
		).text();
		// The heading survives for the accessibility tree, where it is the panel's name. What went
		// is the `rounded-xl border p-4` around a label the tab strip had already given: roughly
		// 90px of every tab spent restating the selected tab back at the reader.
		expect(intro).toContain('<h2 className="sr-only">{title}</h2>');
		expect(intro).toContain('proseMeasureClass');
		expect(intro).not.toContain('<Card');

		// A tab whose header carries controls keeps its Card, because there the panel is holding
		// something. Milestones is the one that does.
		const milestones = await source('projects', 'detail', 'MilestonesTab.tsx');
		expect(milestones).toContain('<CardHeader');
	});

	test('keeps Project Detail card headings below their containing panel', async () => {
		for (const file of [
			'DeleteProjectCard.tsx',
			'MoveProjectCard.tsx',
			'ReintakeCard.tsx',
			'RenameProjectCard.tsx',
		]) {
			const card = await source('projects', 'detail', file);
			expect(card).toContain('headingLevel={3}');
		}

		const repositoryInfo = await source('projects', 'detail', 'RepositoryInfoCard.tsx');
		expect(repositoryInfo).toContain('headingLevel={3}');

		const repositoryRefs = await source('projects', 'detail', 'RepositoryRefsCard.tsx');
		expect(repositoryRefs).toContain('headingLevel={3}');
		expect(repositoryRefs).toContain('headingLevel={4}');

		const overview = await source('projects', 'detail', 'OverviewTab.tsx');
		expect(overview).toMatch(
			/<CardHeader[\s\S]*?headingLevel=\{3\}[\s\S]*?level="subsection"[\s\S]*?title="aidd activity"/u,
		);

		for (const [file, title] of [
			['MilestonesTab.tsx', 'Milestones'],
			['ReportsTab.tsx', 'Reports'],
		] as const) {
			const tab = await source('projects', 'detail', file);
			expect(tab).toContain(`<h2 className="sr-only">${title}</h2>`);
			expect(tab).toContain('headingLevel={3}');
		}
	});
});
