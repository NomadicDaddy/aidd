import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { ContentRail } from '../../frontend/src/lib/contentRails.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function source(relativePath: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src', relativePath)).text();
}

function renderRailComponents(): Record<string, Record<ContentRail, string>> {
	const script = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorActionBar } from './src/components/shared/EditorActionBar.tsx';
import { FilterToolbar } from './src/components/shared/FilterToolbar.tsx';
import { PageRail } from './src/components/shared/PageRail.tsx';
import { SettingsToolbar } from './src/pages/settings/SettingsToolbar.tsx';

const render = (component, props, child) =>
	renderToStaticMarkup(createElement(component, props, child));
const onRail = (rail, child) => render(PageRail, { rail }, child);
const editor = (rail) =>
	onRail(rail, createElement(EditorActionBar, {
			dirty: false,
			onDiscard: () => {},
			onSave: () => {},
			saveLabel: 'Save',
		}));
const filter = (rail) =>
	onRail(
		rail,
		createElement(
			FilterToolbar,
			{
				columns: 'grid-cols-1',
				filtered: 1,
				hasFilters: false,
				noun: 'items',
				onReset: () => {},
				total: 1,
			},
			createElement('input'),
		),
	);
const settings = (rail) =>
	onRail(rail, createElement(SettingsToolbar, {
			activeTab: 'workspace',
			dirty: false,
			dirtyTabs: new Set(),
			onChange: () => {},
			onDiscard: () => {},
			onSave: () => {},
			saveBlockReason: null,
			savePending: false,
		}));
const rails = (component) => ({
	bounded: component('bounded'),
	full: component('full'),
	reading: component('reading'),
});
console.log(JSON.stringify({
	editor: rails(editor),
	filter: rails(filter),
	settings: rails(settings),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Record<
		string,
		Record<ContentRail, string>
	>;
}

describe('toolbar rail ownership', () => {
	test('renders each shared component with one rail on its outer Card', () => {
		const markup = renderRailComponents();
		const railClass: Record<ContentRail, string> = {
			bounded: 'max-w-[80rem]',
			full: 'max-w-none',
			reading: 'max-w-[61rem]',
		};

		for (const component of Object.values(markup)) {
			for (const rail of Object.keys(railClass) as ContentRail[]) {
				expect(component[rail].split(railClass[rail])).toHaveLength(2);
				expect(component[rail]).toMatch(/^<div class="[^"]*max-w-/u);
				expect(
					component[rail].match(new RegExp(`data-content-rail="${rail}"`, 'gu')),
				).toHaveLength(2);
			}
		}
	});

	test('declares the catalog column where the toolbar and the table share it', async () => {
		const [catalog, catalogTab, settings] = await Promise.all([
			source('pages/audits/tabs/CatalogTable.tsx'),
			source('pages/audits/tabs/CatalogTab.tsx'),
			source('pages/settings/SettingsToolbar.tsx'),
		]);

		// The catalog toolbar and table share the full Audits rail. The table owns an explicit
		// measured minimum and scrolls inside that rail, rather than capping both siblings to a
		// narrower arbitrary column and leaving usable desktop width empty.
		expect(catalogTab).toContain('<div className="space-y-5">');
		expect(catalogTab).not.toContain('tableColumnClass');
		expect(catalog).toContain('<Card className="hidden p-0 xl:block">');
		expect(catalog).not.toContain('tableMeasureClass');
		expect(catalog).not.toContain('tableColumnClass');
		expect(catalog).toContain('className={`${contentSizedTableClass} min-w-[1120px]`}');
		expect(settings).toContain('const rail = useContentRail();');
		expect(settings).toContain('data-content-rail={rail}');
		expect(settings).not.toContain('contentRailClass');
	});

	test('requires every FilterToolbar consumer to choose its page rail', async () => {
		const toolbar = await source('components/shared/FilterToolbar.tsx');
		const consumers = [
			'pages/audits/tabs/ApplicabilityTab.tsx',
			'pages/audits/tabs/CatalogToolbar.tsx',
			'pages/audits/tabs/OverridesTab.tsx',
			'pages/projects/detail/AuditsTab.tsx',
			'pages/projects/detail/DependencyGraphFilters.tsx',
			'pages/projects/detail/FeatureFilters.tsx',
			'pages/projects/detail/InterviewFilters.tsx',
			'pages/projects/detail/ReportsTab.tsx',
			'pages/projects/profileMatrix/ProfileMatrixToolbar.tsx',
			'pages/projects/ProjectIngestFilters.tsx',
			'pages/projects/ProjectsToolbar.tsx',
			'pages/runs/RunFilters.tsx',
			'pages/skills/SkillsFilterToolbar.tsx',
			'pages/telemetry/TelemetryFilterToolbar.tsx',
		] as const;
		const restated: string[] = [];

		for (const file of consumers) {
			if ((await source(file)).includes('rail=')) restated.push(file);
		}

		expect(toolbar).toContain('const rail = useContentRail();');
		expect(toolbar).not.toContain('rail: ContentRail;');
		expect(restated).toEqual([]);
	});

	test('never sources a filter toolbar width from an intrinsic measure', async () => {
		const carriers: string[] = [];
		for await (const relativePath of new Bun.Glob('src/**/*.tsx').scan({
			cwd: frontendRoot,
		})) {
			const text = await Bun.file(resolve(frontendRoot, relativePath)).text();
			// Comments stripped first, including this record’s own explanations of the measure it
			// removed — a census that reads its own rationale reports the rationale as the defect.
			const markup = text.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '').replaceAll(/\/\/.*/gu, '');
			if (/<FilterToolbar[\s>]/u.test(markup) && markup.includes('tableMeasureClass')) {
				carriers.push(relativePath.replaceAll('\\', '/').replace(/^src\//u, ''));
			}
		}

		// The property, stated as the shape rather than as a count: a composition holding a filter
		// toolbar must not also declare an intrinsic width. `tableMeasureClass` sizes an element
		// from its own content, so a toolbar sharing that element takes its right edge from the
		// widest row of the table below it — measured on the audits and reports tabs, and on the
		// Runs tab as three sibling cards ending at 1280 / 1962 / 1280 at 2250x1309. The column a
		// toolbar shares is declared, never contributed.
		expect(carriers).toEqual([]);
	});
});
