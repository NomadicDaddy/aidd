import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { AuditDefinition } from '../../frontend/src/api/types.ts';

import { healthFor } from '../../frontend/src/pages/audits/auditsUtils.ts';
import {
	defaultCatalogSort,
	filterAndSortCatalog,
} from '../../frontend/src/pages/audits/catalogSort.ts';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

function definition(
	name: string,
	counts: {
		applicableProjectCount: number;
		freshReportCount: number;
		missingReportCount: number;
		staleReportCount: number;
	},
): AuditDefinition {
	return {
		applicableBucketCount: 1,
		appliesToBucket: {
			critical_regulated: true,
			internet_single_org: true,
			multi_user_local: true,
			private_team: true,
			prototype_archive: true,
			public_multi_tenant: true,
			single_user_local: true,
		},
		enabled: true,
		excludedProjectCount: 0,
		name,
		path: `D:/applications/aidd/audits/${name}.md`,
		updatedAt: null,
		...counts,
	};
}

const noApplicableProjects = definition('UI_PARITY', {
	applicableProjectCount: 0,
	freshReportCount: 0,
	missingReportCount: 0,
	staleReportCount: 0,
});
const fresh = definition('SECURITY', {
	applicableProjectCount: 1,
	freshReportCount: 1,
	missingReportCount: 0,
	staleReportCount: 0,
});

function renderReportCounts(definitions: AuditDefinition[]): string[] {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ReportCounts } from './src/pages/audits/tabs/catalogCells.tsx';",
		`const definitions = ${JSON.stringify(definitions)};`,
		'console.log(JSON.stringify(definitions.map((definition) => ' +
			'renderToStaticMarkup(createElement(ReportCounts, { definition })))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string[];
}

describe('audit catalog health', () => {
	test('classifies a zero applicability denominator separately from Fresh', () => {
		expect(healthFor(noApplicableProjects)).toBe('not-applicable');
		expect(healthFor(fresh)).toBe('fresh');
	});

	test('keeps zero-denominator audits out of the Fresh filter', () => {
		const definitions = [noApplicableProjects, fresh];
		const filter = (healthFilter: 'fresh' | 'not-applicable') =>
			filterAndSortCatalog(definitions, {
				enabledFilter: 'all',
				healthFilter,
				query: '',
				sort: defaultCatalogSort,
			}).map((item) => item.name);

		expect(filter('fresh')).toEqual(['SECURITY']);
		expect(filter('not-applicable')).toEqual(['UI_PARITY']);
	});

	test('renders the zero denominator as an explicit state', () => {
		const [unavailableMarkup = '', freshMarkup = ''] = renderReportCounts([
			noApplicableProjects,
			fresh,
		]);

		expect(unavailableMarkup).toContain('No applicable projects');
		expect(unavailableMarkup).not.toContain('>0<');
		expect(freshMarkup).toContain('>1<');
		expect(freshMarkup).not.toContain('No applicable projects');
	});
});
