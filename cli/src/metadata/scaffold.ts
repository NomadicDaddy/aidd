import type { RunPlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { isPathAllowlisted } from 'aidd-shared/pipeline/writeAllowlist';
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { copyCommonModules } from './scaffoldCommon.ts';
import { pathExists } from './scaffoldFs.ts';
import { copyScaffoldFiles } from './scaffoldRoot.ts';
import { copySkillContracts, type SkillContractDeps } from './scaffoldSkillContracts.ts';

export type { SkillContractDeps } from './scaffoldSkillContracts.ts';

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
	options: ScaffoldOptions = {},
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
		options.dataDir,
	);
	await copySpecFile(plan, aiddDir);
	await copySharedDirs(options.sharedDirs ?? [], projectDir, allowsTarget, isInitializer);
	await copySharedFiles(options.sharedFiles ?? [], projectDir, allowsTarget);
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
	allAuditFiles: string[],
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
	isInitializer: boolean,
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
	allowsTarget: (relativeTarget: string) => boolean,
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
				`Warning: skipped shared file target outside the project root: ${targetRel}`,
			);
			continue;
		}
		// A shared file configured at a project's own root copies onto itself, which fs.cp rejects
		// with ERR_FS_CP_EINVAL. Nothing is lost by skipping it — the file is already in place —
		// and the warning it otherwise produces reads like a scaffold failure.
		if (sameResolvedPath(source, targetPath)) continue;
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
