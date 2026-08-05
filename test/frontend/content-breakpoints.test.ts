import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

const contentBreakpointContracts = [
	['pages/audits/tabs/ApplicabilityTab.tsx', ['xl:block', 'xl:hidden']],
	['pages/audits/tabs/CatalogTable.tsx', ['xl:block', 'xl:hidden']],
	['pages/projects/detail/AuditsDesktopTable.tsx', ['xl:block']],
	['pages/projects/detail/AuditsMobileList.tsx', ['xl:hidden']],
	['pages/projects/detail/FeaturesDesktopTable.tsx', ['xl:block']],
	['pages/projects/detail/FeaturesTab.tsx', ['xl:hidden']],
	['pages/projects/detail/workingTree/WorkingTreeList.tsx', ['xl:hidden']],
	['pages/projects/detail/workingTree/WorkingTreeTable.tsx', ['xl:block']],
	['pages/runs/PipelineStepSubRows.tsx', ['xl:grid']],
	['pages/runs/UnifiedExecutionTable.tsx', ['xl:block', 'xl:hidden']],
	['pages/settings/BackendDefaultsTable.tsx', ['xl:block', 'xl:hidden']],
] as const;

describe('content-aware responsive breakpoints', () => {
	test('keeps all desktop table layouts behind the xl content breakpoint', async () => {
		expect(contentBreakpointContracts).toHaveLength(11);

		for (const [relativePath, expectedClasses] of contentBreakpointContracts) {
			const source = await readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');

			expect(source).not.toMatch(/\bmd:(?:block|hidden|grid)\b/);
			for (const expectedClass of expectedClasses) {
				expect(source).toContain(expectedClass);
			}
		}
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
		expect(listEditor).toContain("compactGrid && 'lg:grid-cols-2'");
		expect(listEditor).not.toContain("compactGrid && 'sm:grid-cols-2'");
	});
});
