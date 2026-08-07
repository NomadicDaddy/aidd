#!/usr/bin/env bun
/**
 * Application consistency checks for aidd.
 *
 * Mirrors Spernakit's data-directory guard: runtime databases belong in the
 * repository root data/ directory only, never in backend/data/.
 *
 * Enforces: DATA-001 -- project metadata and runtime state stay rooted where the contract puts
 * them, which for databases is the repository-root `data/` directory and nowhere else.
 */
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exit } from 'node:process';

const repoRoot = resolve(import.meta.dir, '..');

const EXCLUDED_DIRECTORIES = new Set([
	'.cache',
	'.git',
	'.idea',
	'.turbo',
	'.vscode',
	'coverage',
	'dist',
	'node_modules',
	'screenshots',
	'tmp',
]);

function normalizeRelPath(path: string): string {
	return path.replace(/\\/g, '/');
}

async function findDbFiles(dir: string, basePath = ''): Promise<string[]> {
	const dbFiles: string[] = [];

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return dbFiles;
	}

	for (const entry of entries) {
		if (EXCLUDED_DIRECTORIES.has(entry)) continue;

		const fullPath = resolve(dir, entry);
		const relativePath = basePath ? `${basePath}/${entry}` : entry;
		const stats = await stat(fullPath);
		if (stats.isDirectory()) {
			dbFiles.push(...(await findDbFiles(fullPath, relativePath)));
			continue;
		}
		if (entry.endsWith('.db')) {
			dbFiles.push(relativePath);
		}
	}

	return dbFiles;
}

async function findRogueDataFolders(): Promise<string[]> {
	const rogueFolders: string[] = [];
	for (const workspace of ['backend', 'frontend']) {
		const workspacePath = resolve(repoRoot, workspace);
		let entries: string[];
		try {
			entries = await readdir(workspacePath);
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!['backup', 'backups', 'data'].includes(entry.toLowerCase())) continue;
			const fullPath = resolve(workspacePath, entry);
			const stats = await stat(fullPath);
			if (stats.isDirectory()) rogueFolders.push(`${workspace}/${entry}`);
		}
	}
	return rogueFolders;
}

async function checkDatabaseLocation(): Promise<void> {
	console.log('Checking database file locations...');
	const allowed = 'data/aidd-panel.db';
	const dbFiles = await findDbFiles(repoRoot);
	const unauthorizedFiles = dbFiles.map(normalizeRelPath).filter((file) => file !== allowed);

	if (unauthorizedFiles.length > 0) {
		console.error('[FAIL] Unauthorized database files detected:');
		for (const file of unauthorizedFiles) console.error(`  ${file}`);
		throw new Error(`Database files should only exist at ${allowed}.`);
	}

	console.log('   No unauthorized database files found.');
}

async function checkRogueDataFolders(): Promise<void> {
	console.log('Checking for rogue data/ or backup/ folders...');
	const rogueFolders = await findRogueDataFolders();
	if (rogueFolders.length > 0) {
		console.error('[FAIL] Rogue data/ or backup/ folders detected:');
		for (const folder of rogueFolders) console.error(`  ${folder}`);
		throw new Error(
			`data/ and backup/ folders are restricted to the repository root. Found: ${rogueFolders.join(', ')}`,
		);
	}
	console.log('   No rogue data/ or backup/ folders found.');
}

export async function runApplicationChecks(): Promise<number> {
	try {
		await checkDatabaseLocation();
		await checkRogueDataFolders();
		console.log('[OK] Application checks passed.');
		return 0;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] Application check: ${message}`);
		return 1;
	}
}

if (import.meta.main) exit(await runApplicationChecks());
