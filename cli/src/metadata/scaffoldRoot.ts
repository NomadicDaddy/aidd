import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { pathExists } from './scaffoldFs.ts';

const rootScaffoldFiles = [
	'.editorconfig',
	'.gitattributes',
	'.gitignore',
	'.prettierignore',
	'.prettierrc',
	'eslint.config.js',
	'package.json',
	'tsconfig.json',
];

// .githooks is deliberately NOT scaffolded here. The hook is installed by ensureHistoryGuard
// (shared/src/metadata/history-guard.ts), which copies it from scaffolding/.githooks AND wires
// core.hooksPath + the index exec bit — none of which a file copy can do. Scaffolding the files
// alone would produce a project that carries a guard git never runs.
// scripts/ carries require-bun.ts, the preinstall guard package.json points at. It has to be
// scaffolded as a dir because the guard lives one level down.
const rootScaffoldDirs = ['frontend', 'scripts'];

// project.md is scaffolded per-lane. Fresh projects keep the spernakit-like stack directive;
// ingest lanes get the stack-neutral source file and defer to their inferred profile.
const PROJECT_MD = 'project.md';
const FRESH_LANE_PROJECT_MD =
	'Even if not a registered/true spernakit app, all architecture, tech stack, style, and tooling should be spernakit-like unless otherwise necessary and user approved.\n';

export async function copyScaffoldFiles(
	rootDir: string,
	projectDir: string,
	aiddDir: string,
	allowsTarget: (relativeTarget: string) => boolean,
	isInitializer: boolean,
): Promise<void> {
	const source = join(rootDir, 'scaffolding');
	if (!(await pathExists(source))) return;

	await mkdir(projectDir, { recursive: true });
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

async function installProjectMd(
	metadataScaffold: string,
	aiddDir: string,
	isInitializer: boolean,
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
	entries: string[],
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
	dirs: string[],
): Promise<void> {
	for (const dir of dirs) {
		const source = join(sourceDir, dir);
		if (!(await pathExists(source))) continue;
		const target = join(targetDir, dir);
		if (await pathExists(target)) continue;
		await cp(source, target, { dereference: true, recursive: true });
	}
}
