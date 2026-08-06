import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');
const AUDITS = join(SRC, 'pages/audits');
const TABS = join(AUDITS, 'tabs');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(...segments)).text();
}

describe('the catalog table starts on the first screen', () => {
	test('the launch-target picker is a disclosure, not a 33-project grid', async () => {
		// Expanded, the picker ran y=440 to y=810 and pushed the first header of the table this tab
		// exists to show to y=830 — five audit rows on a 1200px screen.
		const card = await read(TABS, 'LaunchTargetsCard.tsx');

		expect(card).toContain('aria-expanded={open}');
		expect(card).toContain('aria-controls={PANEL_ID}');
		expect(card).toContain("{open ? 'Hide targets' : 'Choose targets'}");
		// The grid renders only when open, so the collapsed card is a header and nothing else.
		expect(card).toContain('{open &&');
	});

	test('the tab arrives with it collapsed and opens it to focus it', async () => {
		const tab = await read(TABS, 'CatalogTab.tsx');

		expect(tab).toContain('useState(false)');
		expect(tab).toContain('setLaunchTargetsOpen(true)');
		expect(tab).toContain('open={launchTargetsOpen}');
	});
});

describe('the numeric columns read as columns', () => {
	test('the units live in the header, once, instead of in every row', async () => {
		const utils = await read(AUDITS, 'auditsUtils.ts');
		const table = await read(TABS, 'CatalogTable.tsx');
		const cells = await read(TABS, 'catalogCells.tsx');

		expect(utils).toContain("reportsColumnLabel = 'Reports (fresh / stale / missing)'");
		expect(utils).toContain('bucketsColumnLabel = `Buckets (of ${bucketColumns.length})`');
		expect(table).toContain('{reportsColumnLabel}');
		expect(table).toContain('{bucketsColumnLabel}');
		// The row cell renders digits and a separator; the nouns are gone from it entirely.
		expect(cells).not.toMatch(/\}\s*fresh/u);
		expect(cells).not.toMatch(/\}\s*stale/u);
		expect(cells).not.toMatch(/\}\s*missing/u);
	});

	test('every numeric column is right-aligned and tabular', async () => {
		const table = await read(TABS, 'CatalogTable.tsx');

		expect(table).toContain("const numericCell = 'px-3 py-3 text-right'");
		expect(table).toContain("const numericHead = 'bg-muted px-3 py-3 text-right'");
		// Four numeric columns: score, applicable projects, reports, buckets.
		expect((table.match(/className=\{numericHead\}/g) ?? []).length).toBe(4);
	});

	test('the change score is a column rather than a suffix to a variable-width badge', async () => {
		// `tabular-nums` lines digits up with each other; it cannot line a column up when the cell
		// starts at a different x on every row because the badge before it has a different width.
		const table = await read(TABS, 'CatalogTable.tsx');
		const heads = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));

		expect(heads).toContain('Change Potential');
		expect(heads).toContain('Score');
		expect(heads.indexOf('Change Potential')).toBeLessThan(heads.indexOf('Score'));
	});
});

describe('an overridden audit is identifiable without telling two colours apart', () => {
	test('the row marker is a rule and a weight, not a 6% tint', async () => {
		const list = await read(TABS, 'OverridesList.tsx');

		expect(list).toContain('border-accent font-semibold');
		expect(list).toContain('border-transparent font-medium');
		// Every row reserves the 2px, so switching an override shifts nothing.
		expect(list).toContain('border-l-2');
		// Comments stripped first: the module's doc comment names the tint it replaced, and a
		// negative that matches its own explanation passes for the wrong reason.
		expect(list.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('bg-accent-muted');
	});

	test('the overridden subset can be isolated on its own', async () => {
		const tab = await read(TABS, 'OverridesTab.tsx');

		expect(tab).toContain('<FilterToolbar');
		expect(tab).toContain('label="State"');
		expect(tab).toContain('`Overridden (${overriddenCount})`');
		expect(tab).toContain("stateFilter === 'overridden'");
		expect(tab).toContain("stateFilter === 'default'");
	});

	test('the rules card sizes to its content instead of inheriting the list height', async () => {
		// As a stretched grid item the card inherited the 944px of the capped list beside it, most
		// of it empty, while the list it was matching showed 17 of 42 rows.
		const tab = await read(TABS, 'OverridesTab.tsx');

		expect(tab).toContain('grid items-start gap-4');
	});
});

describe('the applicability matrix can be searched', () => {
	test('the tab carries the shared search affordance', async () => {
		const tab = await read(TABS, 'ApplicabilityTab.tsx');

		expect(tab).toContain('<FilterToolbar');
		expect(tab).toContain('<FilterSearch');
		expect(tab).toContain('visibleRows');
		expect(tab).toContain('No audits match that search.');
	});

	test('the capped card is the only scroll region on the tab', async () => {
		const tab = await read(TABS, 'ApplicabilityTab.tsx');
		const caps = tab.match(/max-h-\[calc\(100dvh-\d+rem\)\]/g) ?? [];

		expect(caps).toEqual(['max-h-[calc(100dvh-24rem)]']);
		// The intro prose is the toolbar's header rather than a card of its own — one fewer box of
		// permanent chrome above a region already short of vertical room.
		expect(tab).toContain('title="Audit ✕ Bucket Applicability"');
		expect(tab.indexOf('<FilterToolbar')).toBeLessThan(
			tab.indexOf('title="Audit ✕ Bucket Applicability"'),
		);
	});
});
