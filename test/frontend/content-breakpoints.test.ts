import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

const contentBreakpointContracts = [
	['pages/audits/tabs/ApplicabilityTab.tsx', ['xl:block', 'xl:hidden']],
	// The catalog's two renderings live in two files now — they were split when the units moved
	// into the column headers and the pair crossed the per-file line cap.
	['pages/audits/tabs/CatalogCards.tsx', ['xl:hidden']],
	['pages/audits/tabs/CatalogTable.tsx', ['xl:block']],
	['pages/projects/detail/AuditsDesktopTable.tsx', ['xl:block']],
	['pages/projects/detail/AuditsMobileList.tsx', ['xl:hidden']],
	['pages/projects/detail/FeaturesDesktopTable.tsx', ['xl:block']],
	['pages/projects/detail/FeaturesTab.tsx', ['xl:hidden']],
	['pages/projects/detail/workingTree/WorkingTreeList.tsx', ['xl:hidden']],
	['pages/projects/detail/workingTree/WorkingTreeTable.tsx', ['xl:block']],
	['pages/runs/UnifiedExecutionTable.tsx', ['xl:block', 'xl:hidden']],
	// Settings is a container-query surface: `SettingsPage` declares the container and this table
	// gates on the settings column's own width rather than on the window's, which is the same
	// content threshold `xl:` was standing in for everywhere else in this list.
	['pages/settings/BackendDefaultsTable.tsx', ['@min-[61rem]:block', '@min-[61rem]:hidden']],
] as const;

describe('content-aware responsive breakpoints', () => {
	test('keeps all desktop table layouts behind the xl content breakpoint', async () => {
		// The expanded pipeline steps are absent by design: PipelineStepTableRows and
		// PipelineStepSubRows are two unconditional components, and UnifiedExecutionTable below
		// picks between them at xl. Neither carries a breakpoint of its own to keep honest.
		expect(contentBreakpointContracts).toHaveLength(11);

		for (const [relativePath, expectedClasses] of contentBreakpointContracts) {
			const source = await readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');

			for (const expectedClass of expectedClasses) {
				expect(source).toContain(expectedClass);
			}
		}
	});

	test('has no md tier to reach for, anywhere under frontend/src', async () => {
		// This replaced a per-file `\bmd:(?:block|hidden|grid)\b` check that ran over the eleven
		// contracts above. Both halves of it were too narrow: the sweep it was written to protect
		// was undone within two days by 38 `md:` utilities in 26 other files, and the alternation
		// would have missed most of them anyway — `md:table-cell`, `md:inline`, `md:col-span-2`,
		// `md:flex-row`, `md:items-center` — including one of the three table/stack swaps it was
		// specifically aimed at. So: every file, and the bare prefix.
		//
		// Shaped to a Tailwind variant and nothing else: the lookbehind drops `spec.md:12` file
		// references and the `--breakpoint-md:` declaration itself, and requiring a utility
		// character after the colon drops prose that quotes `md:` while explaining the rule. The
		// tier is also deleted from @theme, so a stray one emits no CSS; this is what names it.
		const mdVariant = /(?<![-.\w])md:[a-z0-9[!]/;
		const glob = new Bun.Glob('**/*.{ts,tsx,css}');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: frontendSource })) {
			const path = file.replaceAll('\\', '/');
			const source = await readFile(join(frontendSource, file), 'utf8');
			for (const [index, line] of source.split('\n').entries()) {
				if (mdVariant.test(line)) offenders.push(`${path}:${index + 1}`);
			}
		}

		expect(offenders).toEqual([]);
		// The tier is gone from the theme, not merely unused.
		const css = await readFile(join(frontendSource, 'index.css'), 'utf8');
		expect(css).toContain('--breakpoint-md: initial;');
	});

	test('keeps the shared page header stacked until the lg content breakpoint', async () => {
		const source = await readFile(
			join(frontendSource, 'components', 'shared', 'PageHeader.tsx'),
			'utf8',
		);

		expect(source).toContain('flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between');
		expect(source).not.toContain('sm:flex-row sm:items-end sm:justify-between');
	});

	test('contains narrow telemetry and settings content within the main column', async () => {
		const telemetryTable = await readFile(
			join(frontendSource, 'pages', 'telemetry', 'TelemetryChartTable.tsx'),
			'utf8',
		);
		const listEditor = await readFile(
			join(frontendSource, 'pages', 'settings', 'ListEditor.tsx'),
			'utf8',
		);

		expect(telemetryTable).toContain('<div className="sr-only">');
		expect(telemetryTable).not.toContain('<table className="sr-only">');
		expect(listEditor).toContain("compactGrid && '@min-[45rem]:grid-cols-2'");
		expect(listEditor).not.toContain("compactGrid && 'sm:grid-cols-2'");
	});
});
