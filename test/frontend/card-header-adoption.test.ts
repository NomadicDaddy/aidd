import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');
const pagesRoot = join(frontendRoot, 'pages');

function source(...segments: string[]): Promise<string> {
	return Bun.file(join(pagesRoot, ...segments)).text();
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
	{ file: 'pipelineSessions/StepRows.tsx', why: 'per-step row title inside a list' },
	{ file: 'projects/ProjectCard.tsx', why: 'catalog card title, links to the project' },
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
	{ file: 'recipes/RecipeLaunchPanel.tsx', why: 'launch drawer title' },
	{ file: 'recipes/RecipeQuickLaunchPanel.tsx', why: 'launch drawer title' },
	{ file: 'recipes/StepOverviewCard.tsx', why: 'per-step row title inside a list' },
	{ file: 'settings/ExecutionIdentityBadgeLabPage.tsx', why: 'per-example label in a grid' },
	{ file: 'skills/SkillImportDialog.tsx', why: 'dialog title, wired to aria-labelledby' },
	{ file: 'diary/DiaryFeed.tsx', why: 'sticky day divider in a chronological feed' },
	{ file: 'dashboard/DirectorQueueCard.tsx', why: 'per-suggestion row title inside a list' },
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
			if (text.includes('<CardHeader')) continue;
			// A tab that composes sibling panels declares no header of its own — Runs is three
			// panels, each carrying the house header for its own card. Follow one level of local
			// imports rather than reading the absence as a missing header.
			const siblings = [...text.matchAll(/from '\.\/([A-Za-z]+\.tsx)'/g)].flatMap((match) =>
				match[1] === undefined ? [] : [match[1]],
			);
			const headers = await Promise.all(
				siblings.map((sibling) => Bun.file(join(tabRoot, sibling)).text()),
			);
			if (!headers.some((header) => header.includes('<CardHeader'))) missing.push(file);
		}
		// Overview lives on the page rather than in a *Tab.tsx file, so it is checked separately.
		expect(missing).toEqual([]);
		const page = await source('projects', 'ProjectDetailPage.tsx');
		expect(page).toContain('title="Overview"');
	});
});
