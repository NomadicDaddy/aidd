import type { RunPlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { isPathAllowlisted } from 'aidd-shared/pipeline/writeAllowlist';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { copyCommonModules } from './scaffoldCommon.ts';
import { pathExists } from './scaffoldFs.ts';
import { copySkillContracts, type SkillContractDeps } from './scaffoldSkillContracts.ts';

export { skillContractDeps } from './scaffoldSkillContracts.ts';
export type { SkillContractDeps } from './scaffoldSkillContracts.ts';

const rootScaffoldFiles = [
	'.editorconfig',
	'.gitattributes',
	'.gitignore',
	'.prettierignore',
	'.prettierrc',
	'eslint.config.js',
	'package.json',
];

// .githooks is deliberately NOT scaffolded here. The hook is installed by ensureHistoryGuard
// (shared/src/metadata/history-guard.ts), which copies it from scaffolding/.githooks AND wires
// core.hooksPath + the index exec bit — none of which a file copy can do. Scaffolding the files
// alone would produce a project that carries a guard git never runs.
// scripts/ carries require-bun.ts, the preinstall guard package.json points at. It has to be
// scaffolded as a dir (not a rootScaffoldFile) because the guard lives one level down, and it has
// to ship at all: the manifest's `preinstall` would otherwise reference a file the new project
// does not have, failing every install.
const rootScaffoldDirs = ['frontend', 'scripts'];

// project.md is scaffolded per-lane rather than copied verbatim: the fresh spernakit lane
// (initializer) keeps the spernakit-like stack directive, while every ingest lane
// (onboarding/coding/audit/role/directive) — which can target a foreign-stack codebase — gets a
// stack-neutral default that defers to the inferred project-profile.json. Copying the same file to
// both contradicts the correctly inferred profile of an ingested project and forces the coding agent
// to raise a keep-stack-vs-port fork before it can write any code.
const PROJECT_MD = 'project.md';
const FRESH_LANE_PROJECT_MD =
	'Even if not a registered/true spernakit app, all architecture, tech stack, style, and tooling should be spernakit-like unless otherwise necessary and user approved.\n';

export interface SharedFileEntry {
	source: string;
	target?: string | undefined;
}

export interface ScaffoldOptions {
	/** Imported-skill catalog root (`web.dataDir`); lets contract staging resolve imported skills, not just bundled ones. */
	dataDir?: string;
	sharedDirs?: string[];
	sharedFiles?: (SharedFileEntry | string)[];
	skillContracts?: SkillContractDeps;
	/** Spernakit install root (parent of the configured init script); resolves a skill's spernakit-references. */
	spernakitRoot?: string;
}

export async function scaffoldProjectAssets(
	plan: RunPlan,
	rootDir: string,
	options: ScaffoldOptions = {}
): Promise<void> {
	const projectDir = plan.projectDir;
	const aiddDir = metadataPath(projectDir);
	// The Bun/Node root contract (package.json, eslint.config.js, frontend/, shared AGENTS.md)
	// belongs to the fresh lane only. Onboarding/coding/audit/role/directive runs — which can
	// target an ingested foreign codebase (e.g. a Flask app with no package.json) — must never
	// install root scaffold, or they contaminate that project's root. Only the initializer phase
	// writes the root contract; .aidd-internal installs still run for every mode.
	const isInitializer = plan.prompt.phase === 'initializer';
	// The backend write guard only reverts what the agent writes; scaffold writes happen
	// before any iteration, so they must honor plan.writeAllowlist themselves or a
	// metadata-only run (e.g. project-intake on a non-Node codebase) fails on aidd's own
	// root scaffold before the agent ever starts. This is defense-in-depth on top of the phase gate.
	const allowsTarget = (relativeTarget: string): boolean =>
		plan.writeAllowlist === undefined || isPathAllowlisted(relativeTarget, plan.writeAllowlist);

	await copyScaffoldFiles(rootDir, projectDir, aiddDir, allowsTarget, isInitializer);
	await copyCommonModules(rootDir, aiddDir);
	await copyAuditFiles(plan, rootDir, aiddDir);
	await copySkillContracts(
		options.skillContracts,
		rootDir,
		aiddDir,
		options.spernakitRoot,
		options.dataDir
	);
	await copySpecFile(plan, aiddDir);
	await copySharedDirs(options.sharedDirs ?? [], projectDir, allowsTarget, isInitializer);
	await copySharedFiles(options.sharedFiles ?? [], projectDir, allowsTarget);
}

async function copyScaffoldFiles(
	rootDir: string,
	projectDir: string,
	aiddDir: string,
	allowsTarget: (relativeTarget: string) => boolean,
	isInitializer: boolean
): Promise<void> {
	const source = join(rootDir, 'scaffolding');
	if (!(await pathExists(source))) return;

	await mkdir(projectDir, { recursive: true });
	// Root contract files and the frontend/ dir are fresh-lane only. Every other phase runs
	// against a codebase that already owns its root; installing here would overwrite/contaminate it.
	if (isInitializer) {
		await copyMissingEntries(source, projectDir, rootScaffoldFiles.filter(allowsTarget));
		await copyMissingDirEntries(source, projectDir, rootScaffoldDirs.filter(allowsTarget));
	}

	const metadataScaffold = join(source, '.aidd');
	if (!(await pathExists(metadataScaffold))) return;

	await mkdir(aiddDir, { recursive: true });
	const entries = (await readdir(metadataScaffold)).filter((entry) => entry !== PROJECT_MD);
	await copyMissingEntries(metadataScaffold, aiddDir, entries);
	await installProjectMd(metadataScaffold, aiddDir, isInitializer);
}

// Install .aidd/project.md, preserving any existing project-owned file. The fresh spernakit lane keeps
// the current spernakit-like directive; every other lane gets the stack-neutral default (the scaffold
// source file), which defers stack questions to the codebase and project-profile.json.
async function installProjectMd(
	metadataScaffold: string,
	aiddDir: string,
	isInitializer: boolean
): Promise<void> {
	const target = join(aiddDir, PROJECT_MD);
	if (await pathExists(target)) return;
	if (isInitializer) {
		await writeFile(target, FRESH_LANE_PROJECT_MD);
		return;
	}
	const source = join(metadataScaffold, PROJECT_MD);
	if (!(await pathExists(source))) return;
	await cp(source, target, { dereference: true });
}

async function copyMissingEntries(
	sourceDir: string,
	targetDir: string,
	entries: string[]
): Promise<void> {
	for (const entry of entries) {
		const source = join(sourceDir, entry);
		if (!(await pathExists(source))) continue;
		const target = join(targetDir, entry);
		if (await pathExists(target)) continue;
		await cp(source, target, { dereference: true, recursive: true });
	}
}

async function copyMissingDirEntries(
	sourceDir: string,
	targetDir: string,
	dirs: string[]
): Promise<void> {
	for (const dir of dirs) {
		const source = join(sourceDir, dir);
		if (!(await pathExists(source))) continue;
		const target = join(targetDir, dir);
		if (await pathExists(target)) continue;
		await cp(source, target, { dereference: true, recursive: true });
	}
}

async function copySpecFile(plan: RunPlan, aiddDir: string): Promise<void> {
	if (plan.prompt.phase !== 'initializer') return;
	const specSource = plan.scope.specFile;
	if (!specSource) return;
	if (!(await pathExists(specSource))) return;
	await mkdir(aiddDir, { recursive: true });
	const target = join(aiddDir, 'spec.md');
	if (sameResolvedPath(specSource, target)) return;
	await cp(specSource, target, { dereference: true, force: true });
}

async function copyAuditFiles(plan: RunPlan, rootDir: string, aiddDir: string): Promise<void> {
	if (!plan.audit) return;
	const auditsSource = join(rootDir, 'audits');
	if (!(await pathExists(auditsSource))) return;
	const target = join(aiddDir, 'audits');
	await mkdir(target, { recursive: true });

	const allAuditFiles = (await readdir(auditsSource)).filter((entry) => entry.endsWith('.md'));
	const referenceFiles = await filterReferenceAudits(auditsSource, allAuditFiles);
	const namesToCopy = await chooseAuditFiles(plan, auditsSource, allAuditFiles);
	const filesToCopy = new Set<string>([...referenceFiles, ...namesToCopy]);

	for (const file of filesToCopy) {
		await cp(join(auditsSource, file), join(target, file), { force: true });
	}
}

async function chooseAuditFiles(
	plan: RunPlan,
	auditsSource: string,
	allAuditFiles: string[]
): Promise<string[]> {
	const auditPlan = plan.audit;
	if (!auditPlan) return [];
	if (auditPlan.runAll) {
		const referenceFiles = new Set(await filterReferenceAudits(auditsSource, allAuditFiles));
		return allAuditFiles.filter((file) => !referenceFiles.has(file));
	}
	return auditPlan.names.map((name) => `${name}.md`);
}

async function filterReferenceAudits(auditsSource: string, files: string[]): Promise<string[]> {
	const result: string[] = [];
	for (const file of files) {
		const body = await readFile(join(auditsSource, file), 'utf8');
		if (/^type:\s*['"]?reference['"]?\s*$/m.test(body)) result.push(file);
	}
	return result;
}

async function copySharedDirs(
	sharedDirs: string[],
	projectDir: string,
	allowsTarget: (relativeTarget: string) => boolean,
	isInitializer: boolean
): Promise<void> {
	// Shared dirs always land at the project root (join(projectDir, baseName)); they are part of
	// the root contract and only the fresh lane installs them.
	if (!isInitializer) return;
	for (const dir of sharedDirs) {
		const source = isAbsolute(dir) ? dir : resolve(dir);
		if (!(await pathExists(source))) continue;
		const baseName = source.split(/[\\/]/).filter(Boolean).pop();
		if (!baseName) continue;
		if (!allowsTarget(baseName)) continue;
		try {
			await cp(source, join(projectDir, baseName), {
				dereference: true,
				force: true,
				recursive: true,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn(`Warning: failed to copy shared dir ${source}: ${message}`);
		}
	}
}

async function copySharedFiles(
	entries: (SharedFileEntry | string)[],
	projectDir: string,
	allowsTarget: (relativeTarget: string) => boolean
): Promise<void> {
	for (const entry of entries) {
		const source = isAbsolute(typeof entry === 'string' ? entry : entry.source)
			? typeof entry === 'string'
				? entry
				: entry.source
			: resolve(typeof entry === 'string' ? entry : entry.source);
		if (!(await pathExists(source))) continue;
		const fileName = source.split(/[\\/]/).filter(Boolean).pop();
		if (!fileName) continue;
		const targetRel = typeof entry === 'object' && entry.target ? entry.target : fileName;
		if (!allowsTarget(targetRel)) continue;
		const targetPath = join(projectDir, targetRel);
		// Containment: a target is only ever a relative path resolving to a strict child of the
		// project root. An absolute or `..`-traversing target would let a sharedFiles entry
		// overwrite files outside the project.
		if (isAbsolute(targetRel) || !isStrictChildPath(projectDir, targetPath)) {
			console.warn(
				`Warning: skipped shared file target outside the project root: ${targetRel}`
			);
			continue;
		}
		await mkdir(join(targetPath, '..'), { recursive: true });
		try {
			await cp(source, targetPath, { dereference: true, force: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn(`Warning: failed to copy shared file ${source}: ${message}`);
		}
	}
}

function isStrictChildPath(parentDir: string, childPath: string): boolean {
	const parent = resolve(parentDir);
	const child = resolve(childPath);
	if (process.platform === 'win32') {
		return child.toLowerCase().startsWith(`${parent.toLowerCase()}${sep}`);
	}
	return child.startsWith(`${parent}${sep}`);
}

function sameResolvedPath(left: string, right: string): boolean {
	const resolvedLeft = resolve(left);
	const resolvedRight = resolve(right);
	if (process.platform === 'win32') {
		return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
	}
	return resolvedLeft === resolvedRight;
}
