import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(resolve(ROOT, ...path.split('/'))).text();
}

describe('global dialog local remediation', () => {
	test('bounds resting projects without dimming the command-palette escape path', async () => {
		const palette = await read('frontend/src/components/shared/CommandPalette.tsx');

		expect(palette).toContain('const RESTING_PROJECT_LIMIT = 4;');
		expect(palette).toContain('projects.slice(0, RESTING_PROJECT_LIMIT)');
		expect(palette).toContain('search all projects.');
		expect(palette).toContain('_.result-dependent-hint]:opacity-50');
		expect(palette).not.toContain('result-hints');
	});

	test('keeps directive geometry stable and carries apply authorization onto submit', async () => {
		const [intent, modal, target] = await Promise.all([
			read('frontend/src/components/shared/DirectiveIntentField.tsx'),
			read('frontend/src/components/shared/DirectiveLaunchModal.tsx'),
			read('frontend/src/components/shared/DirectiveTargetField.tsx'),
		]);

		expect(intent).toContain("'rounded-xl border px-3 py-3'");
		expect(modal).toContain('Select a project to show its path and branch.');
		expect(target).toContain('Select a project to resolve launch defaults.');
		expect(modal).toContain('Launch and apply changes');
		expect(modal).toContain('toneSurfaceHover.amber');
	});

	test('binds report validation, retains its full draft, and names token state consistently', async () => {
		const [report, token] = await Promise.all([
			read('frontend/src/components/layout/ProjectReportDialog.tsx'),
			read('frontend/src/components/shared/AuthTokenDialog.tsx'),
		]);

		expect(report).toContain('max-w-lg');
		expect(report).toContain('error={projectError}');
		expect(report).toContain('error={descriptionError}');
		expect(report).toContain('Restored from your last unsent report.');
		expect(report).toContain(
			'if (availableProjects.some((project) => project.id === current))',
		);
		expect(report).toMatch(/onSuccess:[\s\S]+?reset\(\);[\s\S]+?onClose\(\);/u);
		expect(token).toContain('Access token');
		expect(token).toContain('This value is stored in this browser only.');
	});
});

describe('standalone and documentation local remediation', () => {
	test('keeps the page title above the About wordmark and formats the build instant', async () => {
		const about = await read('frontend/src/pages/about/AboutPage.tsx');

		expect(about).toContain('<CardHeader');
		expect(about).toContain('title="aidd"');
		expect(about).toContain(
			'description="AI Development Director - your local control panel for planning, running, and auditing AI coding work across your projects."',
		);
		// No hand-rolled muted line beside the slot that already renders one.
		expect(about).not.toContain('text-sm text-muted-foreground');
		expect(about).toContain('formatDate(__AIDD_BUILD_TIMESTAMP__)');
		expect(about).not.toContain('font-display text-xl');
		expect(about).toContain("buttonClassName('secondary')");
		expect(about).not.toContain("buttonClassName('primary')");
	});

	test('keeps Docs recovery in its navigation composition and puts outline links first', async () => {
		const [faq, navigationRail, notFound, outline, page, sidebar, skills] = await Promise.all([
			read('frontend/content/docs/faq.md'),
			read('frontend/src/pages/docs/DocsNavigationRail.tsx'),
			read('frontend/src/pages/docs/DocsNotFound.tsx'),
			read('frontend/src/pages/docs/DocsOutline.tsx'),
			read('frontend/src/pages/docs/DocsPage.tsx'),
			read('frontend/src/pages/docs/DocsSidebar.tsx'),
			read('frontend/content/docs/skills.md'),
		]);

		expect(notFound).toContain('const PAGE_RAIL = pageRailByContentType.reading;');
		expect(notFound).toContain('<DocsNavigationRail />');
		expect(notFound).not.toContain('role="status"');
		// The framed rail is a Card variant="sunken" now; the hand-rolled border it used to
		// draw is what remediation-20260902-card-hand-rolled-panels removed.
		expect(sidebar).toContain('<Card className="grid gap-5 p-3" variant="sunken">');
		expect(navigationRail).toContain('@min-[45rem]:sticky');
		expect(page.indexOf('aria-label="On this page"')).toBeLessThan(
			page.indexOf('<Card className="min-w-0'),
		);
		expect(page).toContain('sticky top-[var(--app-topbar-height,0px)] z-10 self-start');
		expect(outline).toContain(
			'const activationOffset = window.scrollY <= 1 ? 0 : window.innerHeight / 3;',
		);
		const narrowSummary = outline.slice(
			outline.indexOf('<summary'),
			outline.indexOf('</summary>'),
		);
		expect(narrowSummary).toContain('touchTargetRowClass');
		expect(narrowSummary).toContain('{headings.length} sections');
		expect(faq).toContain('[Director chat](/docs/director)');
		expect(faq).toContain('[About](/about)');
		expect(skills).toContain('[Recipes](/docs/recipes)');
		expect(skills).toContain('[bundled skills](/skills)');
	});

	test('preserves the local-run action and duration column floors', async () => {
		const header = await read(
			'frontend/src/components/shared/local-aidd-history/LocalRunsTableHeader.tsx',
		);

		expect(header).toContain('<col className="w-11" />');
		expect(header).toContain('<col className="w-28" />');
		expect(header).not.toContain('<col className="w-10" />');
	});
});
