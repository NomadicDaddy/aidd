import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = join(import.meta.dirname, '..', '..');
const scanRoots = ['backend/src', 'cli/src', 'shared/src', 'scripts', 'test'];
const skippedDirs = new Set(['.git', 'build', 'coverage', 'data', 'dist', 'logs', 'node_modules']);
const scannedExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);

function extension(path: string): string {
	const match = /\.[^.\\/]+$/.exec(path);
	return match?.[0] ?? '';
}

async function collectSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			if (!skippedDirs.has(entry.name)) {
				files.push(...(await collectSourceFiles(path)));
			}
			continue;
		}
		if (entry.isFile() && scannedExtensions.has(extension(entry.name))) {
			files.push(path);
		}
	}
	return files;
}

function relativeRepoPath(path: string): string {
	return relative(repoRoot, path).split(sep).join('/');
}

function directGitSpawnLine(lines: string[], index: number): boolean {
	const line = lines[index] ?? '';
	// Sync forms must be matched too: `Bun.spawnSync(['git', …])` spawns a real console window on
	// Windows exactly as the async form does, but an earlier `Bun\.spawn\(\s*\[` pattern could not
	// match it (the `Sync` sits between `spawn` and the paren), so those call sites were invisible
	// to this check.
	if (
		/(?:Bun\.)?spawn(?:Sync)?\(\s*['"]git['"]/.test(line) ||
		/Bun\.spawn(?:Sync)?\(\s*\[\s*['"]git['"]/.test(line)
	) {
		return true;
	}
	if (!line.includes("['git'") && !line.includes('["git"')) return false;
	const previous = lines.slice(Math.max(0, index - 3), index + 1).join(' ');
	return /\bBun\.spawn(?:Sync)?\(\s*$|\bBun\.spawn(?:Sync)?\(\s+\[/.test(previous);
}

describe('Git subprocess window visibility', () => {
	test('direct Git subprocesses request hidden Windows process windows', async () => {
		const files = (
			await Promise.all(scanRoots.map((root) => collectSourceFiles(join(repoRoot, root))))
		).flat();
		const violations: string[] = [];

		for (const file of files) {
			if (relativeRepoPath(file) === 'test/scripts/git-window-hide.test.ts') continue;
			const text = await readFile(file, 'utf8');
			const lines = text.split(/\r?\n/);
			for (let index = 0; index < lines.length; index++) {
				if (!directGitSpawnLine(lines, index)) continue;
				const block = lines.slice(index, Math.min(index + 14, lines.length)).join('\n');
				if (!/windowsHide:\s*true/.test(block)) {
					violations.push(`${relativeRepoPath(file)}:${index + 1}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
