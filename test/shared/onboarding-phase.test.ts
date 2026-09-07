import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { detectInitialPhase } from 'aidd-shared/metadata/onboarding';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
let projectDir: string;

async function writeFeature(id: string, extra: Record<string, unknown> = {}): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', id);
	await mkdir(dir, { recursive: true });
	const feature = {
		category: 'Core',
		dependencies: [],
		description: id,
		id,
		passes: false,
		status: 'backlog',
		title: id,
		...extra,
	};
	await writeFile(join(dir, 'feature.json'), JSON.stringify(feature, null, 2), 'utf8');
}

async function writeMetadataBase(): Promise<void> {
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n\nBuild the thing.\n', 'utf8');
	await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n', 'utf8');
	// A scaffolded (existing) codebase, so the fallback phase is onboarding rather than initializer.
	await writeFile(join(projectDir, 'package.json'), '{}\n', 'utf8');
}

beforeEach(async () => {
	projectDir = await testTempDir('aidd-onboarding-');
});

afterEach(async () => {
	await removeTempTree(projectDir);
});

describe('detectInitialPhase — ingest lane spec-backlog generation', () => {
	test('an ingested project with spec + changelog + remediation-only features re-enters onboarding', async () => {
		await writeMetadataBase();
		await writeFeature('remediation-20260702-fix-recent-activity');
		await writeFeature('remediation-20260702-tree-start-collapsed');

		// Remediation features + CHANGELOG + spec would satisfy a naive "any feature.json" check and
		// skip straight to coding, orphaning spec.md. It must stay in onboarding to build the backlog.
		expect(await detectInitialPhase(projectDir)).toBe('onboarding');
	});

	test('audit-only feature sets also re-enter onboarding', async () => {
		await writeMetadataBase();
		await writeFeature('audit-security-20260702-harden-inputs');
		await writeFeature('some-finding', { auditSource: 'security' });

		expect(await detectInitialPhase(projectDir)).toBe('onboarding');
	});

	test('once onboarding files a real backlog feature, the next run proceeds to coding (exactly once)', async () => {
		await writeMetadataBase();
		await writeFeature('remediation-20260702-fix-recent-activity');
		expect(await detectInitialPhase(projectDir)).toBe('onboarding');

		// Simulate the onboarding phase turning spec.md into a real backlog feature.
		await writeFeature('kanban-board-columns');
		expect(await detectInitialPhase(projectDir)).toBe('coding');
	});

	test('fresh lane: a real onboarded backlog stays in coding', async () => {
		await writeMetadataBase();
		await writeFeature('user-authentication');
		await writeFeature('dashboard-page');

		expect(await detectInitialPhase(projectDir)).toBe('coding');
	});

	test('a no-spec ingest still onboards (does not loop) to create the spec', async () => {
		// No spec.md — the onboarding phase creates it from analysis, so this must not read as complete.
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n', 'utf8');
		await writeFile(join(projectDir, 'package.json'), '{}\n', 'utf8');
		await writeFeature('user-authentication');

		expect(await detectInitialPhase(projectDir)).toBe('onboarding');
	});
});
