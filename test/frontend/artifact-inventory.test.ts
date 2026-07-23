import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { MaturityDetail, ProjectArtifactRecord } from '../../frontend/src/api/types.ts';
import { buildArtifactInventory } from '../../frontend/src/pages/projects/detail/artifactsUtils.ts';

const specRecord: ProjectArtifactRecord = {
	ageDays: 1,
	exists: true,
	freshness: 'fresh',
	label: 'spec.md',
	mtime: '2026-07-22T00:00:00Z',
	path: '.aidd/spec.md',
	severity: 'required',
	sizeBytes: 100,
};

const responsesRecord: ProjectArtifactRecord = {
	...specRecord,
	exists: false,
	freshness: 'missing',
	label: 'responses.md',
	mtime: null,
	path: '.aidd/responses.md',
	severity: 'optional',
	sizeBytes: 0,
};

const maturity: MaturityDetail = {
	auditProfileBucket: 'single_user_local',
	auditProfileLabel: 'Single-user local',
	currentStageId: null,
	currentStageLabel: null,
	nextAction: null,
	nextArtifactLabel: null,
	nextArtifactSlug: null,
	percent: 100,
	skip: [],
	stages: [
		{
			artifacts: [
				{
					kind: 'catalog',
					label: 'spec.md',
					mtime: specRecord.mtime,
					required: true,
					slug: 'spec.md',
					status: 'fresh',
				},
			],
			complete: 1,
			description: 'Specification exists.',
			id: 'specified',
			label: 'Specified',
			order: 1,
			required: 1,
			status: 'complete',
		},
		{
			artifacts: [
				{
					kind: 'fs-file',
					label: 'deployment.md',
					mtime: '2026-07-22T00:00:00Z',
					required: true,
					slug: 'deployment.md',
					status: 'fresh',
				},
				{
					kind: 'fs-any',
					label: 'Deploy config',
					mtime: '2026-07-22T00:00:00Z',
					required: true,
					slug: 'deploy-config',
					status: 'fresh',
				},
				{
					kind: 'synthetic-release',
					label: 'Release tag',
					mtime: '2026-07-22T00:00:00Z',
					required: true,
					slug: 'release.tag',
					status: 'fresh',
				},
			],
			complete: 3,
			description: 'Deployment evidence exists.',
			id: 'shipped',
			label: 'Shipped',
			order: 7,
			required: 3,
			status: 'complete',
		},
	],
	stageStatuses: [
		{ id: 'specified', label: 'Specified', status: 'complete' },
		{ id: 'shipped', label: 'Shipped', status: 'complete' },
	],
};

function renderArtifactGroups(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ArtifactGroups } from './src/pages/projects/detail/ArtifactGroups.tsx';",
		`const maturity = ${JSON.stringify(maturity)};`,
		`const records = ${JSON.stringify([specRecord, responsesRecord])};`,
		'const view = createElement(ArtifactGroups, { disabled: false, maturity, onToggleSkip: () => undefined, records, skipSet: new Set() });',
		'console.log(renderToStaticMarkup(view));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('artifact inventory', () => {
	test('combines artifact-check records with broader maturity evidence', () => {
		const inventory = buildArtifactInventory([specRecord, responsesRecord], maturity);

		expect(inventory.total).toBe(5);
		expect(inventory.groups[0]?.entries[0]?.record).toEqual(specRecord);
		expect(inventory.groups[1]?.entries.map((entry) => entry.artifact.slug)).toEqual([
			'deployment.md',
			'deploy-config',
			'release.tag',
		]);
		expect(inventory.ungrouped).toEqual([responsesRecord]);
	});

	test('renders deployment evidence through the real React component', () => {
		const html = renderArtifactGroups();

		expect(html).toContain('Shipped (3)');
		expect(html).toContain('deployment.md');
		expect(html).toContain('aria-label="Mark deployment.md as N/A"');
		expect(html).toContain('Deploy config');
		expect(html).toContain('Release tag');
		expect(html).toContain('Other artifacts (1)');
		expect(html).toContain('.aidd/responses.md');
	});
});
