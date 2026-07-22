import type { Stats } from 'node:fs';

import {
	bundledSkillsDir,
	importedSkillsDir,
	isSkillCategory,
	parseSkillDefinition,
	type SkillCategory,
} from 'aidd-shared/skills/catalog';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { assertAllowedPath, pathIsInside } from '../paths.ts';
import { HttpError } from './errors.ts';

const MAX_FILE_COUNT = 2_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export interface ScannedFile {
	absolutePath: string;
	relativePath: string;
	size: number;
}

export interface ScannedSkill {
	category: SkillCategory;
	description: string;
	fileCount: number;
	files: ScannedFile[];
	id: string;
	sourcePath: string;
	sourceSha256: string;
	title: string;
	totalBytes: number;
}

export interface SkillImportPreview {
	category: SkillCategory;
	conflict: 'bundled' | 'imported' | 'none';
	description: string;
	fileCount: number;
	id: string;
	sourcePath: string;
	sourceSha256: string;
	title: string;
	totalBytes: number;
}

export interface SkillImportOptions {
	allowedRoots: string[];
	category?: SkillCategory;
	dataDir: string;
	replace?: boolean;
	rootDir: string;
	sourcePath: string;
}

function isMissing(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
	);
}

export async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (err) {
		if (isMissing(err)) return false;
		throw err;
	}
}

async function scanFiles(root: string): Promise<ScannedFile[]> {
	const files: ScannedFile[] = [];
	let totalBytes = 0;
	async function walk(directory: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new HttpError(
					'Skill packages cannot contain symbolic links or junctions',
					400
				);
			}
			if (entry.isDirectory()) {
				await walk(path);
				continue;
			}
			if (!entry.isFile())
				throw new HttpError(`Unsupported skill package entry: ${path}`, 400);
			const info = await lstat(path);
			if (info.size > MAX_FILE_BYTES) {
				throw new HttpError(`Skill file exceeds 25 MiB: ${entry.name}`, 400);
			}
			totalBytes += info.size;
			if (totalBytes > MAX_TOTAL_BYTES)
				throw new HttpError('Skill package exceeds 100 MiB', 400);
			files.push({
				absolutePath: path,
				relativePath: relative(root, path).replaceAll('\\', '/'),
				size: info.size,
			});
			if (files.length > MAX_FILE_COUNT) {
				throw new HttpError('Skill package exceeds 2,000 files', 400);
			}
		}
	}
	await walk(root);
	return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function hashSkillFiles(files: ScannedFile[]): Promise<string> {
	const hasher = new Bun.CryptoHasher('sha256');
	for (const file of files) {
		hasher.update(`${file.relativePath}\0${file.size}\0`);
		hasher.update(await readFile(file.absolutePath));
	}
	return hasher.digest('hex');
}

export async function scanSkill(options: SkillImportOptions): Promise<ScannedSkill> {
	let allowedPath: string;
	try {
		allowedPath = assertAllowedPath(options.allowedRoots, options.sourcePath);
	} catch (err) {
		throw new HttpError(
			err instanceof Error ? err.message : 'Skill path is outside allowed roots',
			400
		);
	}
	let sourceEntry: Stats;
	try {
		sourceEntry = await lstat(allowedPath);
	} catch (err) {
		if (isMissing(err)) {
			throw new HttpError(`Skill directory not found: ${options.sourcePath}`, 404);
		}
		throw err;
	}
	if (sourceEntry.isSymbolicLink()) {
		throw new HttpError('Skill import source cannot be a symbolic link or junction', 400);
	}
	if (!sourceEntry.isDirectory()) {
		throw new HttpError('Skill import source must be a directory', 400);
	}
	let sourcePath: string;
	try {
		sourcePath = await realpath(allowedPath);
	} catch (err) {
		if (isMissing(err)) {
			throw new HttpError(`Skill directory not found: ${options.sourcePath}`, 404);
		}
		throw err;
	}
	try {
		assertAllowedPath(options.allowedRoots, sourcePath);
	} catch (err) {
		throw new HttpError(
			err instanceof Error ? err.message : 'Skill path is outside allowed roots',
			400
		);
	}
	const importedRoot = importedSkillsDir(options.dataDir);
	if (pathIsInside(importedRoot, sourcePath) || pathIsInside(sourcePath, importedRoot)) {
		throw new HttpError('Import source cannot overlap aidd imported skill storage', 400);
	}
	const files = await scanFiles(sourcePath);
	if (!files.some((file) => file.relativePath === 'SKILL.md')) {
		throw new HttpError('Skill import source must contain SKILL.md at its root', 400);
	}
	const id = basename(sourcePath);
	let parsed;
	try {
		parsed = parseSkillDefinition({
			body: await readFile(join(sourcePath, 'SKILL.md'), 'utf8'),
			id,
			origin: 'imported',
			sourcePath: join(sourcePath, 'SKILL.md'),
			supportPaths: files
				.map((file) => file.relativePath)
				.filter((path) => path !== 'SKILL.md'),
		});
	} catch (err) {
		throw new HttpError(err instanceof Error ? err.message : 'Invalid skill definition', 400);
	}
	const category = options.category ?? parsed.category;
	if (!isSkillCategory(category)) {
		throw new HttpError(`Invalid skill category: ${String(category)}`, 400);
	}
	return {
		category,
		description: parsed.description,
		fileCount: files.length,
		files,
		id,
		sourcePath,
		sourceSha256: await hashSkillFiles(files),
		title: parsed.title,
		totalBytes: files.reduce((total, file) => total + file.size, 0),
	};
}

export async function conflictFor(
	rootDir: string,
	dataDir: string,
	id: string
): Promise<SkillImportPreview['conflict']> {
	if (await pathExists(join(bundledSkillsDir(rootDir), id))) return 'bundled';
	if (await pathExists(join(importedSkillsDir(dataDir), id))) return 'imported';
	return 'none';
}

export async function previewSkillImport(options: SkillImportOptions): Promise<SkillImportPreview> {
	const scanned = await scanSkill(options);
	return {
		category: scanned.category,
		conflict: await conflictFor(options.rootDir, options.dataDir, scanned.id),
		description: scanned.description,
		fileCount: scanned.fileCount,
		id: scanned.id,
		sourcePath: scanned.sourcePath,
		sourceSha256: scanned.sourceSha256,
		title: scanned.title,
		totalBytes: scanned.totalBytes,
	};
}
