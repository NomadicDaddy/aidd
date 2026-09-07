import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(resolve(ROOT, path)).text();
}

describe('the skills catalog uses the shared catalog composition', () => {
	test('fills the catalog rail and follows the page rhythm', async () => {
		const page = await read('frontend/src/pages/skills/SkillsPage.tsx');

		expect(page).toContain('const PAGE_RAIL = pageRailByContentType.catalog;');
		expect(page).toContain('page-reveal @container space-y-5');
		expect(page).toContain('useViewportFill<HTMLDivElement>({ gutterPx: 24 })');
		expect(page).toContain(
			'<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>',
		);
		expect(page).not.toContain('contentRailClass');
	});

	test('owns the count, reset and category totals in FilterToolbar', async () => {
		const [catalog, filter, page] = await Promise.all([
			read('frontend/src/pages/skills/SkillCatalog.tsx'),
			read('frontend/src/pages/skills/SkillsFilterToolbar.tsx'),
			read('frontend/src/pages/skills/SkillsPage.tsx'),
		]);

		expect(filter).toContain('<FilterToolbar');
		expect(filter).toContain('categoryCounts');
		expect(filter).toContain('count: categoryCounts.get(option.value) ?? 0');
		expect(filter).toContain("hasFilters={query.trim().length > 0 || category !== 'all'}");
		expect(filter).toContain('<FieldRow group label="Category">');
		expect(filter).not.toContain('fieldLabelClass');
		expect(catalog).not.toContain('Showing {skills.length} of {total} skills');
		// The catalog owns no reset of its own: the page builds one register from the same
		// `clearFilters` the toolbar resets with, and hands it down.
		expect(catalog).toContain('<EmptyState filterReset="toolbar" filters={filters}>');
		expect(page).toContain('const emptyFilters = filterRegister(clearFilters, [');
		expect(page).toContain('filters={emptyFilters}');
	});

	test('keeps catalog actions in the header and skill actions with the skill', async () => {
		const [details, header] = await Promise.all([
			read('frontend/src/pages/skills/SkillDetailsCard.tsx'),
			read('frontend/src/pages/skills/SkillsHeaderActions.tsx'),
		]);

		expect(header).toContain('Import skill');
		expect(header).not.toContain('Schedule');
		expect(details).toContain('/scheduled?type=skill&id=');
		expect(details).toContain('Schedule');
		expect(details).not.toContain('title="Usage"');
	});

	test('gives the skill definition the elastic document track', async () => {
		const [definition, page] = await Promise.all([
			read('frontend/src/pages/skills/SkillDefinitionCard.tsx'),
			read('frontend/src/pages/skills/SkillsPage.tsx'),
		]);

		expect(page).toContain('@min-[80rem]:grid-cols-[minmax(18rem,36rem)_minmax(0,1fr)]');
		expect(page).not.toContain(
			'@min-[80rem]:grid-cols-[minmax(0,1fr)_minmax(0,calc(46ch*0.875_+_3rem))]',
		);
		expect(definition).not.toContain('monoEditorMeasureCardClass');
		expect(definition).not.toContain('markdownProseMeasureClass');
		expect(definition).not.toContain('p-6');
	});

	test('top-aligns filter labels and keeps short catalog results content-sized', async () => {
		const [catalog, filter, page] = await Promise.all([
			read('frontend/src/pages/skills/SkillCatalog.tsx'),
			read('frontend/src/pages/skills/SkillsFilterToolbar.tsx'),
			read('frontend/src/pages/skills/SkillsPage.tsx'),
		]);

		expect(filter).not.toContain('@min-[62rem]:items-end');
		expect(page).toContain('grid min-w-0 items-start gap-4');
		expect(catalog).toContain('@min-[40rem]:max-h-full');
		expect(catalog).not.toContain('@min-[40rem]:h-full');
	});

	test('lets phone identifiers take their own line before metadata wraps', async () => {
		const catalog = await read('frontend/src/pages/skills/SkillCatalog.tsx');

		expect(catalog).toContain('flex min-w-0 flex-wrap items-center gap-x-2');
		expect(catalog).toContain('min-w-0 font-mono break-words max-sm:basis-full sm:truncate');
		expect(catalog).toContain('<span className="shrink-0">{tags.join');
	});
});

describe('skill import keeps constraints and outcomes beside their controls', () => {
	test('uses shared category labels and gives the path the full dialog row', async () => {
		const dialog = await read('frontend/src/pages/skills/SkillImportDialog.tsx');

		expect(dialog).toContain('SKILL_CATEGORY_FILTERS.flatMap');
		expect(dialog).toContain('max-w-xl');
		expect(dialog).not.toContain('max-w-3xl');
		expect(dialog).not.toContain('className="max-w-none"');
		expect(dialog).toContain('<FieldRow className="sm:max-w-52" label="Category">');
		expect(dialog).not.toContain('sm:grid-cols-[minmax(0,1fr)_13rem_auto]');
	});

	test('renders preview errors and the allowed-root constraint at the path field', async () => {
		const dialog = await read('frontend/src/pages/skills/SkillImportDialog.tsx');

		expect(dialog).toContain('error={previewError}');
		expect(dialog).toContain('setPreviewError(');
		expect(dialog).toContain('if (requestId !== previewRequestId.current) return;');
		expect(dialog).not.toContain(
			"toast.error(error instanceof Error ? error.message : 'Import preview failed')",
		);
		expect(dialog).toContain('Application Root in Settings');
		expect(dialog).toContain('to="/settings"');
		expect(dialog).toContain('touchTargetTextClass');
		expect(dialog).toMatch(/label="Local folder"\s+required/u);
	});

	test('announces every preview outcome and reserves its place in the dialog', async () => {
		const dialog = await read('frontend/src/pages/skills/SkillImportDialog.tsx');

		expect(dialog).toContain('aria-live="polite"');
		expect(dialog).toContain('aria-live="polite" role="status"');
		expect(dialog).not.toContain('min-h-20');
		expect(dialog).toContain('className={fieldErrorClass} role="alert"');
	});

	test('uses machine typography, pluralizes files and keeps commit stable in the footer', async () => {
		const dialog = await read('frontend/src/pages/skills/SkillImportDialog.tsx');
		const footer = dialog.slice(dialog.indexOf('<DialogFooter'));

		expect(dialog).toContain('className="font-mono text-muted-foreground"');
		expect(dialog).toContain("preview.fileCount === 1 ? 'file' : 'files'");
		expect(footer).toMatch(/disabled=\{\s*!preview\s*\|\|\s*preview\.conflict === 'bundled'/u);
		expect(footer).not.toContain('{preview ? (');
		expect(footer).toMatch(/<Button[\s\S]*variant="primary"[\s\S]*<\/DialogFooter>/);
	});

	test('explains blocked actions and resets an abandoned import', async () => {
		const dialog = await read('frontend/src/pages/skills/SkillImportDialog.tsx');
		const previewAt = dialog.indexOf("{previewImport.isPending ? 'Checking…' : 'Preview'}");
		const categoryAt = dialog.indexOf('<FieldRow className="sm:max-w-52" label="Category">');

		expect(previewAt).toBeGreaterThan(-1);
		expect(categoryAt).toBeGreaterThan(previewAt);
		expect(dialog).toContain('aria-describedby={previewDisabledReason ? previewReasonId');
		expect(dialog).toContain('aria-describedby={importDisabledReason ? importReasonId');
		expect(dialog).toContain('Enter a local folder path.');
		expect(dialog).toContain('Preview the folder before importing.');
		expect(dialog).toContain("setCategory('general');");
		expect(dialog).toContain("setSourcePath('');");
		expect(dialog).toContain('Cancel');
		expect(dialog).not.toMatch(/>\s*Close\s*</u);
		expect(dialog).toContain('<DialogBody className="grid gap-4 px-5 py-4">');
	});
});
