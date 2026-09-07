import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function read(relative: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, 'src', relative)).text();
}

/** A census that scans raw text reports the comment explaining a decision as the decision. */
function stripComments(raw: string): string {
	return raw
		.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/\/\/.*/gu, '');
}

/**
 * Every tab strip in the app and what it measured at 390x844.
 *
 * The density follows the measurement, not the tab count: a strip is `compact` because its
 * triggers wrapped, and a wrapped strip has no stable shape, since the row a tab lands on shifts
 * with the selection. The counts are recorded so a later reader can re-derive the decision instead
 * of inheriting a threshold. Settings and Project Intake were the two that wrapped; Run panels sits
 * one trigger under the width where it would, and stays a strip because `compact` collapses below
 * `lg` and that strip only ever renders below `sm`.
 */
const STRIPS: readonly { compact: boolean; file: string; measured: string }[] = [
	{ compact: true, file: 'pages/audits/AuditsPage.tsx', measured: 'compact before this pass' },
	{
		compact: true,
		file: 'pages/projects/ProjectDetailPage.tsx',
		measured: 'compact before this pass',
	},
	{
		compact: true,
		file: 'pages/projects/ProjectIntakePanel.tsx',
		measured: '4 tabs, 2 rows, 96px',
	},
	{ compact: false, file: 'pages/runs/RunsPanelTabs.tsx', measured: '3 tabs, 1 row, 44px' },
	{
		compact: true,
		file: 'pages/settings/SettingsToolbar.tsx',
		measured: '5 tabs, 3 rows, 148px',
	},
];

function renderStrip(): Record<string, string> {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TabList } from './src/components/ui/tabs.tsx';

const render = (tabs, density) =>
	renderToStaticMarkup(
		createElement(TabList, {
			activeTab: 'alpha',
			ariaLabel: 'Sections',
			density,
			idPrefix: 'probe',
			onChange: () => {},
			tabs,
		}),
	);

const plain = [{ id: 'alpha', label: 'Alpha' }, { id: 'beta', label: 'Beta' }];
const labelled = [
	{ id: 'alpha', label: 'Alpha' },
	{
		badge: createElement('span', null, 'dot'),
		badgeLabel: 'unsaved changes',
		id: 'beta',
		label: 'Beta',
	},
];

console.log(
	JSON.stringify({
		compactLabelled: render(labelled, 'compact'),
		compactPlain: render(plain, 'compact'),
		defaultLabelled: render(labelled, 'default'),
	}),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, string>;
}

describe('phone chrome depth', () => {
	test('every tab strip in the app is accounted for by a measurement', async () => {
		const found: string[] = [];
		for await (const relative of new Bun.Glob('src/**/*.tsx').scan({ cwd: frontendRoot })) {
			const file = relative.replaceAll('\\', '/').replace(/^src\//u, '');
			const text = stripComments(await Bun.file(resolve(frontendRoot, relative)).text());
			if (text.includes('<TabList')) found.push(file);
		}

		// A strip added later is a strip nobody measured at 390. Failing here is the prompt to
		// measure it and add the row, not to widen the census.
		expect(found.slice().sort()).toEqual(STRIPS.map((strip) => strip.file).sort());
	});

	test('a strip that wraps at phone width collapses instead', async () => {
		for (const strip of STRIPS) {
			const text = stripComments(await read(strip.file));
			const open = text.indexOf('<TabList');
			const close = text.indexOf('/>', open);
			const call = text.slice(open, close);

			expect(`${strip.file} (${strip.measured}): ${call.includes('density="compact"')}`).toBe(
				`${strip.file} (${strip.measured}): ${strip.compact}`,
			);
		}
	});

	test('a badge that survives the strip survives its collapse', async () => {
		for (const strip of STRIPS) {
			if (!strip.compact) continue;
			const text = stripComments(await read(strip.file));
			// An `<option>` renders text and nothing else, so a badge with no `badgeLabel` is a
			// fact deleted at exactly the width the strip stopped being on screen.
			if (!text.includes('badge:')) continue;
			expect(`${strip.file}: ${text.includes('badgeLabel:')}`).toBe(`${strip.file}: true`);
		}
	});

	test('the collapsed select carries the badge in words', () => {
		const markup = renderStrip();

		expect(markup.compactLabelled).toContain('<option value="beta">Beta — unsaved changes');
		expect(markup.compactPlain).toContain('<option value="beta">Beta</option>');

		// A tab with no badge gains no suffix, and the default strip renders no select at all.
		expect(markup.compactLabelled).toContain(
			'<option value="alpha" selected="">Alpha</option>',
		);
		expect(markup.defaultLabelled).not.toContain('<option');
	});
});

describe('phone settings commit controls', () => {
	test('the two commit rows are complementary, never simultaneous', async () => {
		const toolbar = stripComments(await read('pages/settings/SettingsToolbar.tsx'));
		const commitBar = stripComments(await read('pages/settings/SettingsCommitBar.tsx'));

		// One breakpoint, two halves. `SettingsCommitBar` pins Discard and Save to the foot of the
		// viewport below `sm`; the toolbar's own copy of the same two buttons is off across exactly
		// that range. Widen or narrow either side and a settings surface either shows the pair twice
		// on one screen, or loses the only way to commit the form.
		expect(commitBar).toContain('className="sm:hidden"');
		expect(toolbar).toContain(
			'className="flex shrink-0 items-center justify-end gap-2 max-sm:hidden"',
		);

		// The status line is not part of the pair and stays at every width: it says which tab holds
		// the edit and accurately names both controls that can commit a dirty Director Profile.
		expect(toolbar).toContain('the phone Save control also commits it.');
		expect(toolbar).toContain(
			"flex items-start gap-1.5 text-xs max-sm:hidden ${saveBlockReason ? '' : '@min-[32rem]:justify-end'} ${statusTone}",
		);
	});
});

describe('phone filter toolbar depth', () => {
	test('dense surfaces opt into one phone row without dropping their secondary filters', async () => {
		const toolbar = stripComments(await read('components/shared/FilterToolbar.tsx'));
		const readout = stripComments(await read('components/shared/FilterToolbarReadout.tsx'));
		const overrides = stripComments(await read('pages/audits/tabs/OverridesTab.tsx'));
		const diary = stripComments(await read('pages/diary/DiaryFilterBar.tsx'));

		expect(toolbar).toContain("mobileLayout?: 'inline' | 'stacked'");
		expect(overrides).toContain('mobileLayout="inline"');
		expect(overrides).toContain('className="max-sm:[&>label]:sr-only"');
		// Diary keeps both compact axes in the first phone row so its primary action and readout
		// can share the second instead of creating a third toolbar row.
		expect(diary).toContain('grid-cols-[minmax(0,1fr)_auto]');
		expect(diary).toContain('primaryControlCount={2}');
		expect(diary).toContain("activeFilterCount={countActiveFilters(timeWindow !== 'all')}");
		// The compact visible count and icon-only reset keep the mutation on the same phone row;
		// the full wording remains mounted for assistive technology and wider layouts.
		expect(readout).toContain('{filtered}/{total}');
		expect(readout).toContain('sr-only @min-[36rem]:hidden');
		expect(readout).toContain(
			"responsiveScope === 'viewport' ? 'max-sm:sr-only' : '@max-[36rem]:sr-only'",
		);
	});

	test('the trailing group leaves the phone viewport whole, actions included', async () => {
		const readout = stripComments(await read('components/shared/FilterToolbarReadout.tsx'));

		// Exempting actions from the hide is what left a 64px control and a second copy of the
		// count on screen below a disclosure that already stated both.
		expect(readout).toContain("hasMobileFilters && '@max-[36rem]:hidden'");
		expect(readout).not.toContain('!hasActions');
	});

	test('inline actions remain reachable while only duplicate readout chrome collapses', async () => {
		const toolbar = stripComments(await read('components/shared/FilterToolbar.tsx'));
		const readout = stripComments(await read('components/shared/FilterToolbarReadout.tsx'));

		expect(toolbar).toContain("actions={actionLayout === 'inline' ? actions : undefined}");
		expect(readout).toContain('data-action-role={actionRole}');
		expect(readout).toContain("hasMobileFilters && '@max-[36rem]:hidden'");

		// `stacked` callers own a disclosure of their own and remain independent.
		expect(toolbar).toContain("{actions && actionLayout === 'stacked' ? (");
	});
});
