import {
	type ImportedSkillRecord,
	type ImportedSkillRegistry,
	importedSkillRegistryPath,
	importedSkillsDir,
	parseSkillDefinition,
	readImportedSkillRegistry,
} from 'aidd-shared/skills/catalog';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { pathIsInside } from '../paths.ts';
import { HttpError } from './errors.ts';
import {
	conflictFor,
	hashSkillFiles,
	pathExists,
	previewSkillImport,
	type ScannedSkill,
	scanSkill,
	type SkillImportOptions,
	type SkillImportPreview,
} from './skillImportScan.ts';

export { previewSkillImport };
export type { SkillImportOptions, SkillImportPreview };

// Concurrent mutations of the same data dir can roll back each other's freshly
// installed destination and leave catalog.json pointing at a missing directory,
// so every import/delete is serialized per resolved data dir.
const mutationQueues = new Map<string, Promise<unknown>>();

async function withImportLock<T>(dataDir: string, action: () => Promise<T>): Promise<T> {
	const key = resolve(dataDir);
	const previous = mutationQueues.get(key) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(action);
	mutationQueues.set(key, next);
	try {
		return await next;
	} finally {
		if (mutationQueues.get(key) === next) mutationQueues.delete(key);
	}
}

function checkedRemovalRoot(root: string, target: string): string {
	const resolvedRoot = resolve(root);
	const resolvedTarget = resolve(target);
	if (resolvedRoot === resolvedTarget || !pathIsInside(resolvedRoot, resolvedTarget)) {
		throw new Error(`Refusing to remove path outside imported skill storage: ${target}`);
	}
	return resolvedTarget;
}

async function copyScannedSkill(scanned: ScannedSkill, destination: string): Promise<void> {
	for (const file of scanned.files) {
		const target = join(destination, file.relativePath);
		await mkdir(dirname(target), { recursive: true });
		await copyFile(file.absolutePath, target);
	}
}

async function writeRegistry(dataDir: string, registry: ImportedSkillRegistry): Promise<void> {
	const path = importedSkillRegistryPath(dataDir);
	await mkdir(dirname(path), { recursive: true });
	const temp = join(dirname(path), `.catalog-${randomUUID()}.tmp`);
	await writeFile(temp, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
	const backup = join(dirname(path), `.catalog-${randomUUID()}.bak`);
	const hadExisting = await pathExists(path);
	try {
		if (hadExisting) await rename(path, backup);
		await rename(temp, path);
	} catch (err) {
		await rm(temp, { force: true });
		if (hadExisting && (await pathExists(backup))) await rename(backup, path);
		throw err;
	}
	if (hadExisting) await rm(backup, { force: true }).catch(() => undefined);
}

export async function importSkill(
	options: SkillImportOptions,
): Promise<{ id: string } & ImportedSkillRecord> {
	return withImportLock(options.dataDir, () => importSkillLocked(options));
}

async function importSkillLocked(
	options: SkillImportOptions,
): Promise<{ id: string } & ImportedSkillRecord> {
	const scanned = await scanSkill(options);
	const conflict = await conflictFor(options.rootDir, options.dataDir, scanned.id);
	if (conflict === 'bundled') {
		throw new HttpError(`Bundled skill already exists: ${scanned.id}`, 409);
	}
	if (conflict === 'imported' && options.replace !== true) {
		throw new HttpError(`Imported skill already exists: ${scanned.id}`, 409);
	}
	const importedRoot = importedSkillsDir(options.dataDir);
	await mkdir(importedRoot, { recursive: true });
	const staging = join(importedRoot, `.staging-${randomUUID()}`);
	const destination = join(importedRoot, scanned.id);
	const backup = join(importedRoot, `.backup-${randomUUID()}`);
	const registry = await readImportedSkillRegistry(options.dataDir);
	const record: ImportedSkillRecord = {
		category: scanned.category,
		importedAt: new Date().toISOString(),
		sourcePath: scanned.sourcePath,
		sourceSha256: scanned.sourceSha256,
	};
	await mkdir(staging, { recursive: true });
	try {
		await copyScannedSkill(scanned, staging);
		const stagedHash = await hashSkillFiles(
			scanned.files.map((file) => ({
				...file,
				absolutePath: join(staging, file.relativePath),
			})),
		);
		if (stagedHash !== scanned.sourceSha256) {
			throw new HttpError('Skill package changed while it was being imported', 409);
		}
		parseSkillDefinition({
			body: await readFile(join(staging, 'SKILL.md'), 'utf8'),
			id: scanned.id,
			imported: record,
			origin: 'imported',
			sourcePath: join(staging, 'SKILL.md'),
			supportPaths: scanned.files
				.map((file) => file.relativePath)
				.filter((path) => path !== 'SKILL.md'),
		});
		if (conflict === 'imported') await rename(destination, backup);
		await rename(staging, destination);
		registry.skills[scanned.id] = record;
		await writeRegistry(options.dataDir, registry);
	} catch (err) {
		if (await pathExists(staging)) {
			await rm(checkedRemovalRoot(importedRoot, staging), { force: true, recursive: true });
		}
		if (conflict === 'none' && (await pathExists(destination))) {
			await rm(checkedRemovalRoot(importedRoot, destination), {
				force: true,
				recursive: true,
			});
		}
		if (await pathExists(backup)) {
			if (await pathExists(destination)) {
				await rm(checkedRemovalRoot(importedRoot, destination), {
					force: true,
					recursive: true,
				});
			}
			await rename(backup, destination);
		}
		throw err;
	}
	if (conflict === 'imported') {
		await rm(checkedRemovalRoot(importedRoot, backup), {
			force: true,
			recursive: true,
		}).catch(() => undefined);
	}
	return { id: scanned.id, ...record };
}

export async function deleteImportedSkill(dataDir: string, id: string): Promise<void> {
	return withImportLock(dataDir, () => deleteImportedSkillLocked(dataDir, id));
}

async function deleteImportedSkillLocked(dataDir: string, id: string): Promise<void> {
	const registry = await readImportedSkillRegistry(dataDir);
	if (!registry.skills[id]) throw new HttpError(`Imported skill not found: ${id}`, 404);
	const importedRoot = importedSkillsDir(dataDir);
	const destination = join(importedRoot, id);
	const backup = join(importedRoot, `.delete-${randomUUID()}`);
	await rename(destination, backup);
	try {
		delete registry.skills[id];
		await writeRegistry(dataDir, registry);
	} catch (err) {
		if (await pathExists(backup)) await rename(backup, destination);
		throw err;
	}
	await rm(checkedRemovalRoot(importedRoot, backup), {
		force: true,
		recursive: true,
	}).catch(() => undefined);
}
