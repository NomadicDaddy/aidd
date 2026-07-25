import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldProjectAssets } from '../../cli/src/metadata/scaffold.ts';
import type { RunPlan } from 'aidd-shared/plan/types';

import { testTempDir } from '../_helpers/temp.ts';
const roots: string[] = [];

async function makeRoot(): Promise<string> {
	const root = await testTempDir('aidd-scaffold-test-');
	roots.push(root);
	return root;
}

function scaffoldPlan(
	projectDir: string,
	options: { audit?: RunPlan['audit']; specFile?: string; phase?: string } = {},
): RunPlan {
	const plan = {
		projectDir,
		prompt: { phase: options.phase ?? 'initializer' },
		scope: options.specFile ? { specFile: options.specFile } : {},
	} as RunPlan;
	if (options.audit) plan.audit = options.audit;
	return plan;
}

function auditPlan(names: string[], runAll = false): RunPlan['audit'] {
	const audit: RunPlan['audit'] = {
		codeAfterAudit: false,
		names,
		onCompletion: [],
		runAll,
	};
	if (names[0]) audit.current = names[0];
	return audit;
}

describe('scaffoldProjectAssets', () => {
	afterEach(async () => {
		for (const root of roots.splice(0)) {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('copies root hygiene files and baseline metadata before a run can inspect git status', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const specFile = join(root, 'source-spec.md');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', '.gitignore'), '.aidd/_common/\n.claude/\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.prettierignore'), '.aidd/_common/\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.editorconfig'), 'root = true\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.gitattributes'), '* text=auto\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.prettierrc'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'package.json'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'project.md'), '# Project\n');
		await writeFile(
			join(aiddRoot, 'scaffolding', '.aidd', 'project-structure.md'),
			'# Structure\n',
		);
		await writeFile(specFile, '# Spec\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { specFile }), aiddRoot);

		expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
		expect(existsSync(join(projectDir, '.prettierignore'))).toBe(true);
		expect(existsSync(join(projectDir, '.editorconfig'))).toBe(true);
		expect(existsSync(join(projectDir, '.gitattributes'))).toBe(true);
		expect(existsSync(join(projectDir, '.prettierrc'))).toBe(true);
		expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
		expect(existsSync(join(projectDir, '.aidd', 'project.md'))).toBe(true);
		expect(existsSync(join(projectDir, '.aidd', 'project-structure.md'))).toBe(true);
		expect(await readFile(join(projectDir, '.aidd', 'spec.md'), 'utf8')).toBe('# Spec\n');
	});

	test('honors plan.writeAllowlist: no root scaffold or shared files outside .aidd', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sharedAgents = join(root, 'AGENTS.md');
		const sharedNotes = join(root, 'workspace-notes.md');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(join(aiddRoot, 'scaffolding', 'frontend'), { recursive: true });
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', 'package.json'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.editorconfig'), 'root = true\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'frontend', 'eslint.config.js'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		await writeFile(sharedAgents, '# Agents\n');
		await writeFile(sharedNotes, '# Notes\n');

		const plan = scaffoldPlan(projectDir);
		plan.writeAllowlist = ['.aidd'];
		await scaffoldProjectAssets(plan, aiddRoot, {
			sharedDirs: [join(aiddRoot, 'scaffolding', 'frontend')],
			sharedFiles: [
				sharedAgents,
				{ source: sharedNotes, target: join('.aidd', 'workspace-notes.md') },
			],
		});

		// A metadata-only run (project-intake on a foreign codebase) must leave the
		// application root untouched — only .aidd/ content may be written.
		expect(existsSync(join(projectDir, 'package.json'))).toBe(false);
		expect(existsSync(join(projectDir, '.editorconfig'))).toBe(false);
		expect(existsSync(join(projectDir, 'frontend'))).toBe(false);
		expect(existsSync(join(projectDir, 'AGENTS.md'))).toBe(false);
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
		expect(await readFile(join(projectDir, '.aidd', 'workspace-notes.md'), 'utf8')).toBe(
			'# Notes\n',
		);
	});

	test('non-initializer run installs configured shared files but no scaffold root contract', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sharedAgents = join(root, 'AGENTS.md');
		const sharedNotes = join(root, 'workspace-notes.md');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(join(aiddRoot, 'scaffolding', 'frontend'), { recursive: true });
		// A package.json-less project (e.g. a Flask app) already owns its root.
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', 'package.json'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'eslint.config.js'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'frontend', 'index.html'), '<html></html>\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		await writeFile(sharedAgents, '# Agents\n');
		await writeFile(sharedNotes, '# Notes\n');

		// An audit/role/coding run against a foreign codebase carries no writeAllowlist. The phase
		// gate protects scaffold-owned root files, while explicitly configured shared files remain
		// part of every execution lane.
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'audit' }), aiddRoot, {
			sharedDirs: [join(aiddRoot, 'scaffolding', 'frontend')],
			sharedFiles: [
				sharedAgents,
				{ source: sharedNotes, target: join('.aidd', 'workspace-notes.md') },
			],
		});

		// Scaffold-owned files do not land at the application root...
		expect(existsSync(join(projectDir, 'package.json'))).toBe(false);
		expect(existsSync(join(projectDir, 'eslint.config.js'))).toBe(false);
		expect(existsSync(join(projectDir, 'frontend'))).toBe(false);
		// ...but configured shared files and .aidd-internal installs still run.
		expect(await readFile(join(projectDir, 'AGENTS.md'), 'utf8')).toBe('# Agents\n');
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
		expect(await readFile(join(projectDir, '.aidd', 'workspace-notes.md'), 'utf8')).toBe(
			'# Notes\n',
		);
	});

	test('initializer run still installs the full root contract', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sharedAgents = join(root, 'AGENTS.md');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(join(aiddRoot, 'scaffolding', 'frontend'), { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', 'package.json'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'eslint.config.js'), '{}\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'frontend', 'index.html'), '<html></html>\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		await writeFile(sharedAgents, '# Agents\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'initializer' }), aiddRoot, {
			sharedDirs: [join(aiddRoot, 'scaffolding', 'frontend')],
			sharedFiles: [sharedAgents],
		});

		expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
		expect(existsSync(join(projectDir, 'eslint.config.js'))).toBe(true);
		expect(existsSync(join(projectDir, 'frontend'))).toBe(true);
		expect(await readFile(join(projectDir, 'AGENTS.md'), 'utf8')).toBe('# Agents\n');
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
	});

	test('rejects shared file targets that escape the project root', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sharedNotes = join(root, 'workspace-notes.md');
		const outsideVictim = join(root, 'outside.md');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(projectDir, { recursive: true });
		await writeFile(sharedNotes, '# Notes\n');
		await writeFile(outsideVictim, 'untouched\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'audit' }), aiddRoot, {
			sharedFiles: [
				{ source: sharedNotes, target: join('..', 'outside.md') },
				{ source: sharedNotes, target: outsideVictim },
				{ source: sharedNotes, target: 'inside.md' },
			],
		});

		// Traversing and absolute targets are skipped; the contained one still lands.
		expect(await readFile(outsideVictim, 'utf8')).toBe('untouched\n');
		expect(await readFile(join(projectDir, 'inside.md'), 'utf8')).toBe('# Notes\n');
	});

	test('preserves existing scaffold-managed files in established projects', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', '.gitignore'), '.aidd/_common/\n');
		await writeFile(join(aiddRoot, 'scaffolding', 'package.json'), '{"name":"template"}\n');
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'CHANGELOG.md'), '# Template\n');
		await writeFile(join(projectDir, '.gitignore'), 'custom-ignore\n');
		await writeFile(join(projectDir, 'package.json'), '{"name":"custom"}\n');
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Existing\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		expect(await readFile(join(projectDir, '.gitignore'), 'utf8')).toBe('custom-ignore\n');
		expect(await readFile(join(projectDir, 'package.json'), 'utf8')).toBe(
			'{"name":"custom"}\n',
		);
		expect(await readFile(join(projectDir, '.aidd', 'CHANGELOG.md'), 'utf8')).toBe(
			'# Existing\n',
		);
	});

	test('ingest-lane scaffold installs a stack-neutral project.md with no spernakit directive', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		// The template default (fresh spernakit lane) prescribes a spernakit-like stack.
		await writeFile(
			join(aiddRoot, 'scaffolding', '.aidd', 'project.md'),
			"This project's architecture defers to the codebase and `.aidd/project-profile.json`.\n",
		);

		// An audit/coding run against a foreign-stack codebase (e.g. a Flask app) must not receive a
		// spernakit/TS/Bun directive that contradicts its inferred profile.
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'coding' }), aiddRoot);

		const projectMd = await readFile(join(projectDir, '.aidd', 'project.md'), 'utf8');
		expect(projectMd).not.toMatch(/spernakit/i);
		expect(projectMd).not.toMatch(/\bBun\b/);
		expect(projectMd).not.toMatch(/TypeScript/i);
		expect(projectMd).toMatch(/project-profile\.json/);
	});

	test('fresh initializer lane retains the spernakit-like project.md directive', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await writeFile(
			join(aiddRoot, 'scaffolding', '.aidd', 'project.md'),
			'stack-neutral default\n',
		);

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'initializer' }), aiddRoot);

		const projectMd = await readFile(join(projectDir, '.aidd', 'project.md'), 'utf8');
		expect(projectMd).toMatch(/spernakit-like/i);
	});

	test('does not overwrite an existing project-owned project.md on an ingest lane', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'scaffolding', '.aidd'), { recursive: true });
		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(join(aiddRoot, 'scaffolding', '.aidd', 'project.md'), 'stack-neutral\n');
		await writeFile(join(projectDir, '.aidd', 'project.md'), '# Hand-authored overrides\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'coding' }), aiddRoot);

		expect(await readFile(join(projectDir, '.aidd', 'project.md'), 'utf8')).toBe(
			'# Hand-authored overrides\n',
		);
	});

	test('copies _common modules into project metadata on first scaffold', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'prompts', '_common'), { recursive: true });
		await writeFile(
			join(aiddRoot, 'prompts', '_common', 'project-overrides.md'),
			'# Overrides\n',
		);

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		expect(
			await readFile(join(projectDir, '.aidd', '_common', 'project-overrides.md'), 'utf8'),
		).toBe('# Overrides\n');
	});

	test('does not rewrite an unchanged _common file on a subsequent scaffold', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sourceFile = join(aiddRoot, 'prompts', '_common', 'project-overrides.md');
		const targetFile = join(projectDir, '.aidd', '_common', 'project-overrides.md');

		await mkdir(join(aiddRoot, 'prompts', '_common'), { recursive: true });
		await writeFile(sourceFile, '# Overrides\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);
		const firstMtimeMs = (await stat(targetFile)).mtimeMs;

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);
		const secondMtimeMs = (await stat(targetFile)).mtimeMs;

		// An unchanged source must not reopen the destination for write — the very contention
		// that share-violates (EBUSY) on Windows when a run holds the file open for read.
		expect(secondMtimeMs).toBe(firstMtimeMs);
	});

	test('propagates a genuinely changed _common file to project metadata', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sourceFile = join(aiddRoot, 'prompts', '_common', 'project-overrides.md');
		const targetFile = join(projectDir, '.aidd', '_common', 'project-overrides.md');

		await mkdir(join(aiddRoot, 'prompts', '_common'), { recursive: true });
		await writeFile(sourceFile, '# Overrides\n');
		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		await writeFile(sourceFile, '# Overrides v2 — expanded guidance\n');
		const future = new Date(Date.now() + 60_000);
		await utimes(sourceFile, future, future);

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		expect(await readFile(targetFile, 'utf8')).toBe('# Overrides v2 — expanded guidance\n');
	});

	test('propagates same-length _common changes even when source metadata is not newer', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const sourceFile = join(aiddRoot, 'prompts', '_common', 'project-overrides.md');
		const targetFile = join(projectDir, '.aidd', '_common', 'project-overrides.md');

		await mkdir(join(aiddRoot, 'prompts', '_common'), { recursive: true });
		await writeFile(sourceFile, '# Overrides A\n');
		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		await writeFile(sourceFile, '# Overrides B\n');
		const past = new Date(Date.now() - 60_000);
		await utimes(sourceFile, past, past);

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		expect(await readFile(targetFile, 'utf8')).toBe('# Overrides B\n');
	});

	test('skips spec copy when the requested spec is already the target metadata spec', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const specFile = join(projectDir, '.aidd', 'spec.md');

		await mkdir(join(projectDir, '.aidd'), { recursive: true });
		await writeFile(specFile, '# Existing Spec\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { specFile }), aiddRoot);

		expect(await readFile(specFile, 'utf8')).toBe('# Existing Spec\n');
	});

	test('explicit audit run refreshes a stale project audit definition', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const targetFile = join(projectDir, '.aidd', 'audits', 'SECURITY.md');

		await mkdir(join(aiddRoot, 'audits'), { recursive: true });
		await mkdir(join(projectDir, '.aidd', 'audits'), { recursive: true });
		await writeFile(join(aiddRoot, 'audits', 'SECURITY.md'), '# Security fresh\n');
		await writeFile(targetFile, '# Security stale\n');

		await scaffoldProjectAssets(
			scaffoldPlan(projectDir, { audit: auditPlan(['SECURITY']) }),
			aiddRoot,
		);

		expect(await readFile(targetFile, 'utf8')).toBe('# Security fresh\n');
	});

	test('non-audit run does not create or refresh project audit definitions', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'audits'), { recursive: true });
		await writeFile(join(aiddRoot, 'audits', 'SECURITY.md'), '# Security fresh\n');

		await scaffoldProjectAssets(scaffoldPlan(projectDir), aiddRoot);

		expect(existsSync(join(projectDir, '.aidd', 'audits'))).toBe(false);
	});

	test('audit-all copies runnable audits and reference audits', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		const targetDir = join(projectDir, '.aidd', 'audits');

		await mkdir(join(aiddRoot, 'audits'), { recursive: true });
		await writeFile(join(aiddRoot, 'audits', 'SECURITY.md'), '# Security\n');
		await writeFile(
			join(aiddRoot, 'audits', 'SEVERITY_CLASSIFICATION.md'),
			'---\ntype: reference\n---\n# Severity\n',
		);

		await scaffoldProjectAssets(
			scaffoldPlan(projectDir, { audit: auditPlan([], true) }),
			aiddRoot,
		);

		expect(await readFile(join(targetDir, 'SECURITY.md'), 'utf8')).toBe('# Security\n');
		expect(await readFile(join(targetDir, 'SEVERITY_CLASSIFICATION.md'), 'utf8')).toBe(
			'---\ntype: reference\n---\n# Severity\n',
		);
	});

	test('stages a skill run’s declared contracts and references into workspace .aidd', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');

		await mkdir(join(aiddRoot, 'skills', 'humanize-docs'), { recursive: true });
		await mkdir(join(aiddRoot, 'audits'), { recursive: true });
		await writeFile(
			join(aiddRoot, 'skills', 'humanize-docs', 'SKILL.md'),
			'# Humanize\nStyle contract.\n',
		);
		// A support-file sidecar must ride along with the staged skill.
		await writeFile(
			join(aiddRoot, 'skills', 'humanize-docs', 'personal-voice.md'),
			'# Voice\n',
		);
		await writeFile(
			join(aiddRoot, 'audits', 'SEVERITY_CLASSIFICATION.md'),
			'---\ntype: reference\n---\n# Severity\n',
		);

		// A skill run carries no plan.audit, so the audit-staging path never fires; the
		// contract/reference staging must run on its own.
		const plan = scaffoldPlan(projectDir, { phase: 'directive' });
		plan.writeAllowlist = ['.aidd'];
		await scaffoldProjectAssets(plan, aiddRoot, {
			skillContracts: {
				contracts: ['humanize-docs'],
				references: ['audits/SEVERITY_CLASSIFICATION.md'],
				spernakitReferences: [],
			},
		});

		expect(
			await readFile(
				join(projectDir, '.aidd', 'skills', 'humanize-docs', 'SKILL.md'),
				'utf8',
			),
		).toBe('# Humanize\nStyle contract.\n');
		expect(
			await readFile(
				join(projectDir, '.aidd', 'skills', 'humanize-docs', 'personal-voice.md'),
				'utf8',
			),
		).toBe('# Voice\n');
		expect(
			await readFile(
				join(projectDir, '.aidd', 'audits', 'SEVERITY_CLASSIFICATION.md'),
				'utf8',
			),
		).toBe('---\ntype: reference\n---\n# Severity\n');
	});

	test('skill-contract staging tolerates missing sources and absent options', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const projectDir = join(root, 'project');
		await mkdir(join(aiddRoot, 'skills'), { recursive: true });

		// No options.skillContracts: nothing staged, no throw.
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'directive' }), aiddRoot);
		expect(existsSync(join(projectDir, '.aidd', 'skills'))).toBe(false);

		// A declared dependency that does not exist on disk is skipped, not fatal.
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'directive' }), aiddRoot, {
			skillContracts: {
				contracts: ['does-not-exist'],
				references: ['audits/missing.md'],
				spernakitReferences: [],
			},
		});
		expect(existsSync(join(projectDir, '.aidd', 'skills', 'does-not-exist'))).toBe(false);
		expect(existsSync(join(projectDir, '.aidd', 'audits', 'missing.md'))).toBe(false);
	});

	test('stages a contract skill from the imported catalog when it is not bundled', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const dataDir = join(root, 'data');
		const projectDir = join(root, 'project');

		// The contract skill exists only in the imported catalog (dataDir/skills), not bundled.
		await mkdir(join(aiddRoot, 'skills'), { recursive: true });
		await mkdir(join(dataDir, 'skills', 'imported-contract'), { recursive: true });
		await writeFile(
			join(dataDir, 'skills', 'imported-contract', 'SKILL.md'),
			'# Imported\nContract body.\n',
		);

		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'directive' }), aiddRoot, {
			dataDir,
			skillContracts: {
				contracts: ['imported-contract'],
				references: [],
				spernakitReferences: [],
			},
		});

		expect(
			await readFile(
				join(projectDir, '.aidd', 'skills', 'imported-contract', 'SKILL.md'),
				'utf8',
			),
		).toBe('# Imported\nContract body.\n');
	});

	test('stages spernakit-references from the spernakit root only when one is configured', async () => {
		const root = await makeRoot();
		const aiddRoot = join(root, 'aidd');
		const spernakitRoot = join(root, 'spernakit');
		const projectDir = join(root, 'project');

		await mkdir(join(spernakitRoot, 'docs', 'template'), { recursive: true });
		await writeFile(join(spernakitRoot, 'docs', 'template', 'STACK.md'), '# Stack rules\n');

		const deps = {
			contracts: [],
			references: [],
			spernakitReferences: ['docs/template/STACK.md'],
		};

		// Without a spernakit root, the spernakit-reference is not staged (the skill's
		// <spernakit-root> fallback applies instead).
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'directive' }), aiddRoot, {
			skillContracts: deps,
		});
		expect(existsSync(join(projectDir, '.aidd', 'docs', 'template', 'STACK.md'))).toBe(false);

		// With a configured spernakit root, it resolves and stages locally.
		await scaffoldProjectAssets(scaffoldPlan(projectDir, { phase: 'directive' }), aiddRoot, {
			skillContracts: deps,
			spernakitRoot,
		});
		expect(
			await readFile(join(projectDir, '.aidd', 'docs', 'template', 'STACK.md'), 'utf8'),
		).toBe('# Stack rules\n');
	});
});
