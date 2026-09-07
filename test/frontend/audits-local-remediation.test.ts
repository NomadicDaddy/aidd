import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const TABS = resolve(import.meta.dir, '../../frontend/src/pages/audits/tabs');
const FRONTEND = resolve(import.meta.dir, '../../frontend');

function read(file: string): Promise<string> {
	return Bun.file(join(TABS, file)).text();
}

function renderCatalogToolbar(
	runAllDisabledReason: string | undefined,
	runSelectedDisabledReason: string | undefined,
): string {
	const script = [
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		"import { CatalogToolbar } from './src/pages/audits/tabs/CatalogToolbar.tsx';",
		`const props = { auditsEnabled: true, enabledFilter: 'all', filteredCount: 1, healthFilter: 'all', launchTargets: createElement('p', null, 'Launch targets'), onEnabledFilterChange: () => {}, onHealthFilterChange: () => {}, onQueryChange: () => {}, onRun: () => {}, onToggleAuditsEnabled: () => {}, query: '', runAllDisabledReason: ${JSON.stringify(runAllDisabledReason)}, runLaunchPending: false, runSelectedDisabledReason: ${JSON.stringify(runSelectedDisabledReason)}, selectedAuditCount: 1, selectedProjectPath: undefined, settingsReady: true, totalCount: 1, updatePending: false };`,
		"const toolbar = createElement(PageRail, { rail: 'full' }, createElement(CatalogToolbar, props));",
		'const tree = createElement(QueryClientProvider, { client: new QueryClient() }, toolbar);',
		'console.log(renderToStaticMarkup(tree));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

function buttonWithText(html: string, label: string): string {
	const button = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gu)]
		.map(([markup]) => markup)
		.find((markup) => markup.includes(label));
	if (!button) throw new Error(`Could not find the ${label} button`);
	return button;
}

describe('audit workspace local remediation', () => {
	test('blocked launch actions use their visible explanation without tooltip duplicates', async () => {
		const tab = await read('CatalogTab.tsx');
		const toolbar = await read('CatalogToolbar.tsx');

		expect(tab).toContain('launch target above');
		expect(toolbar).not.toContain('title={runSelectedDisabledReason}');
		expect(toolbar).not.toContain('title={runAllDisabledReason}');
		expect(toolbar).toContain('role="status"');
	});

	test('shares one rendered explanation when Run Selected and Run All have the same reason', () => {
		const reason = 'Select at least one launch target above to enable run actions.';
		const html = renderCatalogToolbar(reason, reason);
		const runSelected = buttonWithText(html, 'Run Selected');
		const runAll = buttonWithText(html, 'Run All');

		expect(runSelected).toContain('aria-describedby="audits-run-selected-disabled-help"');
		expect(runAll).toContain('aria-describedby="audits-run-selected-disabled-help"');
		expect(html).toContain(
			`id="audits-run-selected-disabled-help" role="status">${reason}</span>`,
		);
		expect(html).not.toContain('id="audits-run-all-disabled-help"');
	});

	test('renders separate explanations when the disabled reasons differ', () => {
		const html = renderCatalogToolbar('No launch targets are available.', 'Select an audit.');

		expect(buttonWithText(html, 'Run Selected')).toContain(
			'aria-describedby="audits-run-selected-disabled-help"',
		);
		expect(buttonWithText(html, 'Run All')).toContain(
			'aria-describedby="audits-run-all-disabled-help"',
		);
		expect(html).toContain(
			'id="audits-run-selected-disabled-help" role="status">Select an audit.</span>',
		);
		expect(html).toContain(
			'id="audits-run-all-disabled-help" role="status">No launch targets are available.</span>',
		);
	});

	test('does not describe or disable Run All when it has no reason', () => {
		const runAll = buttonWithText(renderCatalogToolbar(undefined, undefined), 'Run All');

		expect(runAll).not.toContain('aria-describedby');
		expect(runAll).not.toContain('disabled=""');
	});

	test('change potential is a neutral sortable magnitude with score emphasis', async () => {
		const table = await read('CatalogTable.tsx');
		const cards = await read('CatalogCards.tsx');

		expect(table).toContain('label="Change Potential"');
		expect(table).toContain('className={`${compactHead} whitespace-nowrap`}');
		expect(table).toContain('<Badge tone="neutral">');
		expect(table).toContain("item.changePotential.band === 'High' ? toneText.teal");
		expect(cards).toContain('<Badge tone="neutral">');
	});

	test('each override states its inherited baseline once beside the editable value', async () => {
		const list = await read('OverridesList.tsx');
		const tab = await read('OverridesTab.tsx');

		expect(list).toContain('Inherited: {inheritedLabel}');
		expect(list).toContain('aria-describedby={inheritedId}');
		expect(list).toContain("ariaLabel.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()");
		expect(list).toContain('`${tableId}-inherited-${definition.name}`');
		expect(list).not.toContain('overrideEffectTone');
		expect(tab).toContain('useProjectAudits(projectId)');
		expect(tab).toContain('useAuditProfileMapping()');
		expect(tab).toContain('Compare inherited audit policy');
	});
});
