import { describe, expect, test } from 'bun:test';
import type { ResolvedConfig } from 'aidd-shared/config';
import type { AuditProfileMapping } from 'aidd-shared/contracts';
import {
	auditProfileOverridesPath,
	writeAuditProfileMapping,
	writeAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { printJson } from 'aidd-shared/metadata/json-format';
import { MATURITY_SKIP_FILE } from 'aidd-shared/metadata/maturity';
import { metadataPath } from 'aidd-shared/metadata/paths';
import {
	projectProfilePath,
	writeProjectAssuranceProfile,
} from 'aidd-shared/metadata/project-profile';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { updateMaturitySkip } from '../../backend/src/services/project/profile.ts';
import { AuditService } from '../../backend/src/services/auditService.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import { RecipeService } from '../../backend/src/services/recipeService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import { testTempDir } from '../_helpers/temp.ts';

const mapping: AuditProfileMapping = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	rules: [
		{
			audits: ['SECURITY'],
			description: 'Original wording.',
			effect: 'required',
			id: 'security-required',
			match: {},
		},
	],
	version: 1,
};

function makeAuditService(rootDir: string): AuditService {
	const config: ResolvedConfig = {
		auditsEnabled: true,
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		preflightDoctor: false,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
	};
	return new AuditService(
		config,
		{
			listProjects: async () => ({ projects: [], skippedRoots: [] }),
			resolveDiscoveredProject: async (projectId: string) => projectId,
		} as unknown as ProjectService,
		{ launchRun: async () => ({ id: 'run_1' }) } as unknown as RunService,
		rootDir,
	);
}

async function runGit(cwd: string, args: string[]): Promise<string> {
	const process = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [exitCode, stderr, stdout] = await Promise.all([
		process.exited,
		new Response(process.stderr).text(),
		new Response(process.stdout).text(),
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	return stdout;
}

async function expectCanonical(path: string): Promise<void> {
	const raw = await readFile(path, 'utf8');
	expect(raw).toBe(printJson(JSON.parse(raw) as unknown));
}

describe('tracked JSON writers', () => {
	test('keeps an Applicability save to one changed line in a tracked mapping', async () => {
		const rootDir = await testTempDir('aidd-tracked-audit-mapping-');
		const mappingPath = join(rootDir, 'audits', 'audit-profile-mapping.json');
		await mkdir(join(rootDir, 'audits'), { recursive: true });
		await writeFile(join(rootDir, 'audits', 'SECURITY.md'), '# Security\n');
		await writeFile(mappingPath, printJson(mapping));
		await runGit(rootDir, ['init']);
		await runGit(rootDir, ['add', 'audits/audit-profile-mapping.json']);
		await runGit(rootDir, [
			'-c',
			'user.name=aidd Test',
			'-c',
			'user.email=aidd-test@example.invalid',
			'commit',
			'-m',
			'chore: add mapping',
		]);

		await makeAuditService(rootDir).saveAuditProfileMapping({
			...mapping,
			rules: [{ ...mapping.rules[0]!, description: 'Revised wording.' }],
		});

		expect((await runGit(rootDir, ['diff', '--numstat'])).trim()).toBe(
			'1\t1\taudits/audit-profile-mapping.json',
		);
		const diff = await runGit(rootDir, [
			'diff',
			'--unified=0',
			'--',
			'audits/audit-profile-mapping.json',
		]);
		expect(diff).toContain('-\t\t\t"description": "Original wording.",');
		expect(diff).toContain('+\t\t\t"description": "Revised wording.",');
		await expectCanonical(mappingPath);
	});

	test('normalizes an incorrectly formatted mapping on its next write', async () => {
		const rootDir = await testTempDir('aidd-normalize-audit-mapping-');
		const mappingPath = join(rootDir, 'audits', 'audit-profile-mapping.json');
		await mkdir(join(rootDir, 'audits'), { recursive: true });
		await writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);

		await writeAuditProfileMapping(rootDir, mapping);

		expect(await readFile(mappingPath, 'utf8')).toBe(printJson(mapping));
	});

	test('uses the same canonical serializer for repository metadata definitions', async () => {
		const rootDir = await testTempDir('aidd-tracked-json-writers-');
		const profile = await writeProjectAssuranceProfile(rootDir, {
			authMode: 'local_owner',
			bucket: 'single_user_local',
			criticality: 'utility',
			dataSensitivity: 'low',
			deployment: 'local',
			derivesFromTemplate: 'none',
			externalIntegrations: 'none',
			hasCliBinary: 'none',
			publishesReleaseArchives: 'none',
			shipsContainerImage: 'none',
		});
		await writeAuditProfileOverrides(rootDir, {
			audits: { SECURITY: 'required' },
			rules: [],
			updatedAt: '2026-09-02T00:00:00.000Z',
			version: 1,
		});
		await updateMaturitySkip({ resolveDiscoveredProject: async () => rootDir }, 'project', [
			'spec.md',
		]);
		await new RecipeService(rootDir).writeRecipe({
			id: 'format-check',
			name: 'Format check',
			parameters: [],
			steps: [
				{
					configJson: {},
					id: 'format-check_step_1',
					name: 'Run check',
					stepType: 'aidd-cli',
				},
			],
		});

		expect(profile.source).toBe('explicit');
		await expectCanonical(projectProfilePath(rootDir));
		await expectCanonical(auditProfileOverridesPath(rootDir));
		await expectCanonical(join(metadataPath(rootDir), MATURITY_SKIP_FILE));
		await expectCanonical(join(rootDir, 'recipes', 'format-check.json'));
	});
});

const nonRepositoryPrettyJsonWriters = [
	'backend/src/services/director/cycleExecutor.ts',
	'backend/src/services/director/cycleService.ts',
	'backend/src/services/pipeline/sessionMetricsDump.ts',
	'backend/src/services/settingsService.ts',
	'backend/src/services/skillImports.ts',
	'cli/src/metadata/log-cleaner.ts',
	'cli/src/modes/director.ts',
	'cli/src/prompts/compile.ts',
	'shared/src/agent/client/simulation.ts',
	'shared/src/metadata/active-runs.ts',
	'shared/src/metadata/feature-leases.ts',
	'shared/src/metadata/store/artifacts.ts',
	'shared/src/metadata/store/runHistory.ts',
].sort();

async function sourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
		else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
	}
	return files;
}

test('requires direct pretty JSON file writers to be classified as runtime-only', async () => {
	const repositoryRoot = resolve(import.meta.dir, '../..');
	const roots = ['backend/src', 'cli/src', 'shared/src'].map((path) =>
		join(repositoryRoot, path),
	);
	const candidates: string[] = [];
	for (const root of roots) {
		for (const path of await sourceFiles(root)) {
			const source = await readFile(path, 'utf8');
			const writesFile = /\b(?:writeFile|Bun\.write)\s*\(/.test(source);
			const prettyStringify = /JSON\.stringify\([\s\S]*?,\s*null,\s*(?:2|'\\t')\s*\)/.test(
				source,
			);
			if (writesFile && prettyStringify) {
				candidates.push(relative(repositoryRoot, path).replaceAll('\\', '/'));
			}
		}
	}
	expect(candidates.sort()).toEqual(nonRepositoryPrettyJsonWriters);
});
