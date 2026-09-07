import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(resolve(ROOT, ...path.split('/'))).text();
}

function renderMatches(): { contiguous: string; keywordOnly: string } {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { highlightedMatch } from './src/components/shared/command-palette-match.tsx';

const render = (label, query) =>
	renderToStaticMarkup(createElement('span', null, highlightedMatch(label, query)));
console.log(JSON.stringify({
	contiguous: render('Runs', 'run'),
	keywordOnly: render('Refresh current data', 'run'),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(ROOT, 'frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		contiguous: string;
		keywordOnly: string;
	};
}

describe('command palette local composition', () => {
	test('keeps navigation groups, responsive results, and visible overflow orientation', async () => {
		const [command, palette] = await Promise.all([
			read('frontend/src/components/ui/command.tsx'),
			read('frontend/src/components/shared/CommandPalette.tsx'),
		]);

		expect(palette).toContain('navGroups.map((group)');
		expect(palette).toContain('heading={group.label}');
		expect(palette).not.toContain('heading="Navigation"');
		expect(palette).not.toContain('Project control');
		expect(palette).not.toContain('Launch run');
		expect(palette).toContain('max-h-[min(60vh,44rem)]');
		expect(palette.match(/mask-image:linear-gradient/g)).toHaveLength(3);
		expect(command).toContain('[&_[cmdk-group-heading]]:sticky');
	});

	test('uses the app control, explains matches, and offers an empty recovery action', async () => {
		const [command, match, palette] = await Promise.all([
			read('frontend/src/components/ui/command.tsx'),
			read('frontend/src/components/shared/command-palette-match.tsx'),
			read('frontend/src/components/shared/CommandPalette.tsx'),
		]);

		expect(command).toContain("import { formControlClass } from '../../lib/formStyles.ts';");
		expect(command).toContain('formControlClass');
		expect(match).toContain('function highlightedMatch');
		expect(match).toMatch(
			/<mark\s+className="bg-accent-muted font-semibold text-accent-muted-foreground"/u,
		);
		expect(palette).toContain('Clear search');
		expect(palette).toContain('<EmptyState');
		expect(palette).toContain("event.key !== 'Escape'");
		expect(palette).not.toContain('Jump to pages, projects, and high-frequency actions.');
		expect(palette).toContain('<PaletteShortcut');
	});

	test('puts unique actions first, shares shortcut definitions, and marks only literal matches', async () => {
		const [palette, shortcuts] = await Promise.all([
			read('frontend/src/components/shared/CommandPalette.tsx'),
			read('frontend/src/lib/keyboardShortcuts.ts'),
		]);
		const actionsIndex = palette.indexOf('heading="Actions"');
		const projectsIndex = palette.indexOf('heading="Projects"');
		const navigationIndex = palette.indexOf('{navGroups.map');

		expect(actionsIndex).toBeGreaterThan(-1);
		expect(actionsIndex).toBeLessThan(projectsIndex);
		expect(projectsIndex).toBeLessThan(navigationIndex);
		expect(shortcuts).toContain('export const navigationShortcuts');
		expect(palette).toContain('<NavigationPaletteShortcut route={item.to} />');
		expect(palette).toContain('<PaletteShortcut shortcut={directiveShortcut} />');
		expect(palette).toContain('<PaletteShortcut shortcut={refreshShortcut} />');

		const { contiguous, keywordOnly } = renderMatches();
		expect(contiguous.match(/<mark/g)).toHaveLength(1);
		expect(contiguous).toContain('<mark');
		expect(contiguous).toContain(
			'class="bg-accent-muted font-semibold text-accent-muted-foreground"',
		);
		expect(contiguous).toContain('Run</mark>s');
		expect(keywordOnly).not.toContain('<mark');
	});

	test('keeps every selected-row content layer on the active-list contrast pair', async () => {
		const [command, match, palette] = await Promise.all([
			read('frontend/src/components/ui/command.tsx'),
			read('frontend/src/components/shared/command-palette-match.tsx'),
			read('frontend/src/components/shared/CommandPalette.tsx'),
		]);

		expect(command).toContain(
			'data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent-muted-foreground',
		);
		expect(command).toContain('data-[selected=true]:shadow-[inset_4px_0_0_var(--accent)]');
		expect(command).not.toContain(
			'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
		);
		expect(command).toContain('gap-2 rounded-lg px-2 py-2');
		expect(palette).toContain('group-data-[selected=true]:text-accent-muted-foreground');
		expect(
			palette.match(
				/block truncate text-xs text-muted-foreground group-data-\[selected=true\]:text-accent-muted-foreground/g,
			),
		).toHaveLength(3);
		expect(match).toContain('bg-accent-muted font-semibold text-accent-muted-foreground');
	});
});

describe('global dialog adoption', () => {
	test('protects an unsaved directive and exposes field associations and target provenance', async () => {
		const [modal, projectHint, target, intentField, targetField] = await Promise.all([
			read('frontend/src/components/shared/DirectiveLaunchModal.tsx'),
			read('frontend/src/components/shared/DirectiveProjectHint.tsx'),
			read('frontend/src/components/shared/directive-launch-target.ts'),
			read('frontend/src/components/shared/DirectiveIntentField.tsx'),
			read('frontend/src/components/shared/DirectiveTargetField.tsx'),
		]);
		// Every field the launcher shows, wherever the section rendering it lives. The property is
		// that the operator sees all four labelled, not that one file spells them all out.
		const launcher = [modal, intentField, targetField].join('\n');

		for (const label of ['Project', 'Directive', 'Execution intent', 'Launch target']) {
			expect(launcher).toContain(`label="${label}"`);
		}
		expect(modal).toContain('if (prompt.trim())');
		expect(modal).toContain('setDiscardOpen(true)');
		expect(modal).toContain('title="Discard unsaved directive?"');
		expect(modal).toContain('confirmLabel="Discard directive"');
		expect(launcher).toContain('Select a project to resolve the launch target.');
		expect(target).toContain("'Project configuration applied.'");
		expect(target).toContain("'Global configuration applied.'");
		expect(modal).toContain('toneText.amber');
		expect(modal).toContain('projectId={selectedProject?.id}');
		expect(projectHint).toContain('useProjectGitStatus(projectId)');
	});

	test('uses visible report labels and semantic dialog colors', async () => {
		const [header, report] = await Promise.all([
			read('frontend/src/components/layout/ProjectReportDialogHeader.tsx'),
			read('frontend/src/components/layout/ProjectReportDialog.tsx'),
		]);

		expect(report).toMatch(/<FieldRow[\s\S]{0,120}?group[\s\S]{0,120}?label="Report type"/u);
		for (const label of ['Project', 'Description']) {
			expect(report).toMatch(new RegExp(`<FieldRow[\\s\\S]{0,400}?label="${label}"`, 'u'));
		}
		expect(header).toContain('text-muted-foreground');
		expect(report).not.toMatch(/text-neutral|dark:text-neutral/);
		expect(header).not.toMatch(/text-neutral|dark:text-neutral/);
	});

	test('keeps the token dialog on one edge with sentence-case actions', async () => {
		const token = await read('frontend/src/components/shared/AuthTokenDialog.tsx');

		expect(token).not.toContain('KeyRound');
		expect(token).toContain('mt-1 text-sm text-muted-foreground');
		expect(token).toContain("'Save token'");
		expect(token).not.toContain('Save Token');
		expect(token).toContain('configured={token.length > 0}');
		expect(token).toContain('context="web-store"');
		expect(token).toContain('label="Access token"');
		expect(token).toContain('Settings &gt; Control Panel &gt; Network');
		expect(token).toContain('variant="danger"');
	});
});

describe('gallery and standalone pages', () => {
	test('makes each constrained identity row one measured comparison', async () => {
		// The lab is two files: the specimen sheet and the instrument that measures it.
		const lab = (
			await Promise.all([
				read('frontend/src/pages/settings/ExecutionIdentityBadgeLabPage.tsx'),
				read('frontend/src/pages/settings/ExecutionIdentityConstrainedSpecimens.tsx'),
			])
		).join(String.fromCharCode(10));

		expect(lab).toContain('representativeIdentities.map');
		expect(lab).toContain('function MeasuredSpecimen');
		expect(lab).toContain('renders at ${renderedWidth}px');
		expect(lab).toContain(
			'<ExecutionIdentityBadges {...identity} paintedRef={badgeRef} variant="compact" />',
		);
		expect(lab).not.toContain('withTooltip={false}');
		expect(lab).toContain('constrained-width comparison');
		expect(lab).not.toContain('variant="sunken"');
	});

	test('keeps standalone reading rails on the page edge with distinct exits', async () => {
		const [about, notFound] = await Promise.all([
			read('frontend/src/pages/about/AboutPage.tsx'),
			read('frontend/src/pages/notFound/NotFoundPage.tsx'),
		]);

		for (const page of [about, notFound])
			expect(page).toContain('const PAGE_RAIL = pageRailByContentType.reading;');
		expect(about).toContain('page-reveal space-y-5');
		expect(about).not.toContain('page-reveal mx-auto');
		expect(notFound).toContain('page-reveal space-y-5');
		expect(notFound).not.toContain('page-reveal mx-auto');
		expect(notFound).toContain('to="/docs"');
		expect(notFound).toContain('to="/"');
		expect(notFound).toContain("buttonClassName('primary')");
		expect(notFound).toContain('Go to dashboard');
	});
});

describe('documentation local polish', () => {
	test('uses shared captions, responsive card padding, and readable definition rows', async () => {
		const [definitions, outline, page, renderer, typography] = await Promise.all([
			read('frontend/src/components/shared/MarkdownDefinitionList.tsx'),
			read('frontend/src/pages/docs/DocsOutline.tsx'),
			read('frontend/src/pages/docs/DocsPage.tsx'),
			read('frontend/src/components/shared/MarkdownContent.tsx'),
			read('frontend/src/lib/typography.ts'),
		]);

		expect(outline).toContain("cn('pl-3', sectionCaptionClass)");
		expect(page).toContain('<Card className="min-w-0 p-3 sm:p-6 @min-[61rem]:col-start-2');
		expect(renderer).toContain('markdownRunningProseMeasureClass');
		expect(typography).toContain('export const markdownRunningProseMeasureClass');
		expect(typography).toContain('export const definitionTermClass');
		expect(definitions).toContain(
			'<dl className="@container/definitions grid gap-4 pt-2 pb-4">',
		);
		expect(definitions).toContain("id !== undefined && 'group scroll-mt-20'");
		expect(definitions).toContain('{id !== undefined ? (');
		expect(definitions).toContain('aria-label={termLabel}');
		expect(definitions).toContain('<dd className="text-foreground">');
		expect(typography).toContain(
			"export const definitionTermClass = 'font-medium text-muted-foreground'",
		);
		expect(typography).not.toMatch(/definitionTermClass\s*=.*microLabelClass/);
		expect(definitions).not.toMatch(/divide-|border-/);
	});

	test('removes repeated prose and gives skills scannable option definitions', async () => {
		const [faq, scheduled, skills] = await Promise.all([
			read('frontend/content/docs/faq.md'),
			read('frontend/content/docs/scheduled-tasks.md'),
			read('frontend/content/docs/skills.md'),
		]);

		expect(faq).toContain('A run looks stuck — what do I do?');
		expect(faq).not.toContain('A run looks stuck - what do I do?');
		expect(scheduled).not.toContain('- Choose a project scope.');
		for (const item of ['Review only', 'Apply changes', 'Replace', 'Bundled IDs', 'Delete']) {
			expect(skills).toContain(`${item}\n:`);
		}
		expect(skills).toContain('descriptions are required and must contain 1–1,024 characters');
		expect(skills).toContain('provider-specific truncation');
	});

	test('keeps docs navigation accurate and aligns the header with the article', async () => {
		const [audits, page, recipes, settings] = await Promise.all([
			read('frontend/content/docs/audits.md'),
			read('frontend/src/pages/docs/DocsPage.tsx'),
			read('frontend/content/docs/recipes.md'),
			read('frontend/content/docs/settings.md'),
		]);

		for (const term of ['Catalog', 'Applicability', 'Project Overrides'])
			expect(audits).toContain(`${term}\n:`);
		expect(audits).not.toContain('Global enablement\n:');
		expect(recipes).toContain('[Runs](/runs)');
		for (const wireValue of ['aidd-cli', 'skill', 'shell', 'recipe-ref'])
			expect(recipes).toContain(`\`${wireValue}\`\n:`);
		for (const label of [
			'Fallback discovery root',
			'Spernakit Scaffolding',
			'Shared Directories',
			'Shared Files',
			'Director Profile',
			'Model Routing',
			'Providers',
		]) {
			expect(settings).toContain(`${label}\n:`);
		}
		expect(page).toContain('const DOCS_GRID_CLASS =');
		expect(page.indexOf('<PageHeader')).toBeLessThan(
			page.indexOf("<div className={cn('page-reveal', docsGridClass)}>"),
		);
		expect(page).toContain('min-w-0 space-y-6 @min-[45rem]:col-start-2 @min-[61rem]:contents');
		expect(page).toContain("<div className={cn('page-reveal', docsGridClass)}>");
		expect(page).not.toContain('ml-[15.5rem]');
		expect(page).toContain('markdownSummary(body)');
		expect(page).toContain('renderMarkdownInline(summary)');
	});
});
