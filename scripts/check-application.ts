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

interface DbFileScan {
	/**
	 * Entries the walk actually examined, after exclusions.
	 *
	 * The walk swallows read errors so a permission problem does not fail the gate, which means a
	 * tree it never reached returns the same empty file list as a genuinely clean one. The count is
	 * what separates them, and rule 5 of `docs/reference/gate-conventions.md` requires the caller
	 * to report it.
	 */
	examined: number;
	files: string[];
}

async function findDbFiles(dir: string, basePath = ''): Promise<DbFileScan> {
	const files: string[] = [];
	let examined = 0;

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return { examined, files };
	}

	for (const entry of entries) {
		if (EXCLUDED_DIRECTORIES.has(entry)) continue;
		examined += 1;

		const fullPath = resolve(dir, entry);
		const relativePath = basePath ? `${basePath}/${entry}` : entry;
		const stats = await stat(fullPath);
		if (stats.isDirectory()) {
			const sub = await findDbFiles(fullPath, relativePath);
			files.push(...sub.files);
			examined += sub.examined;
			continue;
		}
		if (entry.endsWith('.db')) {
			files.push(relativePath);
		}
	}

	return { examined, files };
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

async function checkDatabaseLocation(): Promise<number> {
	console.log('Checking database file locations...');
	const allowed = 'data/aidd-panel.db';
	const { examined, files } = await findDbFiles(repoRoot);

	// Rule 5. Both sub-checks here assert an absence, and the walk swallows its own read errors,
	// so a tree it could not open produces the same verdict as a clean one. Fail on zero rather
	// than report a pass with nothing behind it.
	if (examined === 0) {
		throw new Error(
			'The repository walk examined no entries. An absence of stray database files cannot ' +
				'be asserted from a tree that was never read.',
		);
	}

	const unauthorizedFiles = files.map(normalizeRelPath).filter((file) => file !== allowed);

	if (unauthorizedFiles.length > 0) {
		console.error('[FAIL] Unauthorized database files detected:');
		for (const file of unauthorizedFiles) console.error(`  ${file}`);
		throw new Error(`Database files should only exist at ${allowed}.`);
	}

	console.log(`   No unauthorized database files found (${examined} entries examined).`);
	return examined;
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
		const examined = await checkDatabaseLocation();
		await checkRogueDataFolders();
		console.log(`[OK] Application checks passed (${examined} repository entries examined).`);
		return 0;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] Application check: ${message}`);
		return 1;
	}
}

if (import.meta.main) exit(await runApplicationChecks());
