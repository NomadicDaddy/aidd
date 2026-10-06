import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolvedConfig } from 'aidd-shared/config';
import type { ModeContext } from 'aidd-shared/modes/types';

import { parseArgs } from 'aidd-shared/args/index';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import { auditNames } from '../../cli/src/modes/audit-selection.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { explicitProjectProfileError } from '../../shared/src/metadata/project-profile.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const rootDir = join(import.meta.dir, '..', '..', '.tmp-audit-selection-rejected-profile');

const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
};

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function setUp(
	name: string,
	profile: Record<string, string>,
): Promise<{ catalogDir: string; projectDir: string }> {
	const catalogDir = join(rootDir, name, 'catalog');
	const projectDir = join(rootDir, name, 'project');
	await mkdir(join(catalogDir, 'audits'), { recursive: true });
	await writeFile(
		join(catalogDir, 'audits', 'SECURITY.md'),
		"---\ntitle: 'SECURITY'\npriority: 'Critical'\ncategory: Core Quality\n---\n\n# SECURITY\n\nBody.\n",
	);
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'project-profile.json'),
		`${JSON.stringify(profile)}\n`,
	);
	return { catalogDir, projectDir };
}

function context(projectDir: string, catalogDir: string): ModeContext {
	return { projectDir, rootDir: catalogDir, store: new FileAiddStore(projectDir) };
}

const validProfile = {
	authMode: 'local_owner',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'low',
	deployment: 'local',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	derivesFromTemplate: 'none',
	source: 'explicit',
	updatedAt: '2026-10-06T00:00:00.000Z',
};

// spernakit-browser's profile carried `deployment: none` and `dataSensitivity: internal`. aidd
// rejected the whole file and chose audits from an inferred profile, and nothing said so.
describe('audit selection with a rejected explicit profile', () => {
	test('reports the rejected file once per project, naming why', async () => {
		const { catalogDir, projectDir } = await setUp('invalid', {
			...validProfile,
			dataSensitivity: 'internal',
			deployment: 'none',
		});
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const plan = resolveRunPlan(
				parseArgs(['--project-dir', projectDir, '--cli', 'native', '--audit-all']),
				config,
			);
			await auditNames(plan, context(projectDir, catalogDir));
			await auditNames(plan, context(projectDir, catalogDir));
			const reports = warn.mock.calls.filter((call) =>
				String(call[0]).includes('project-profile.json is invalid'),
			);
			expect(reports).toHaveLength(1);
			expect(String(reports[0]?.[0])).toContain('inferred profile');
			expect(await explicitProjectProfileError(projectDir)).not.toBeNull();
		} finally {
			warn.mockRestore();
		}
	});

	test('a valid or absent profile reports nothing', async () => {
		const { projectDir } = await setUp('valid', validProfile);
		expect(await explicitProjectProfileError(projectDir)).toBeNull();
		expect(await explicitProjectProfileError(join(rootDir, 'no-such-project'))).toBeNull();
	});
});
