import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { cwd, exit } from 'node:process';

/**
 * Boundary guard: backend/src must not reach into cli/src.
 *
 * The `aidd-cli` package depends on `aidd-backend` (cli/src/app.ts launches the backend's web,
 * MCP, and chat-bridge servers), so a backend -> cli source dependency cannot be represented in
 * the workspace package graph without creating a cycle. Backend-consumed contracts, config, and
 * runtime helpers therefore live in `aidd-shared` (the leaf both packages depend on), and the
 * backend imports them via the `aidd-shared` package name.
 *
 * This check scans `backend/src` for any import/export/dynamic-import whose specifier reaches into
 * `cli/src` — either a relative path that resolves under `cli/src`, or a bare `aidd-cli` package
 * import. Such an import reintroduces the unrepresented cross-package dependency and fails the
 * build. Do not add transitional allowlist entries here without separate product-owner approval.
 */

const BACKEND_SRC = 'backend/src';
const CLI_SRC_ABS = resolve(cwd(), 'cli/src');
const skippedDirs = new Set(['build', 'dist', 'node_modules']);

// Specifier on the `from` clause of a static import/export, or inside a dynamic import().
const specifierPatterns: RegExp[] = [
	/(?:^|\s)(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/,
	/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/,
];

interface Finding {
	file: string;
	line: number;
	reason: string;
	specifier: string;
}

function isScannedFile(path: string): boolean {
	return /\.(?:ts|tsx)$/i.test(path) && !path.endsWith('.d.ts');
}

async function collectFiles(path: string): Promise<string[]> {
	const info = await stat(path);
	if (info.isFile()) return isScannedFile(path) ? [path] : [];
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (skippedDirs.has(entry.name)) continue;
		const child = join(path, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(child)));
		else if (entry.isFile() && isScannedFile(child)) files.push(child);
	}
	return files;
}

function classify(fromFile: string, specifier: string): null | string {
	if (specifier === 'aidd-cli' || specifier.startsWith('aidd-cli/')) {
		return 'imports the aidd-cli package';
	}
	if (specifier.startsWith('.')) {
		const resolved = resolve(dirname(fromFile), specifier);
		const rel = relative(CLI_SRC_ABS, resolved);
		if (!rel.startsWith('..') && !isAbsolute(rel)) {
			return 'relative import resolves into cli/src';
		}
	}
	return null;
}

function scan(file: string, source: string): Finding[] {
	const findings: Finding[] = [];
	const lines = source.split(/\r?\n/);
	lines.forEach((text, index) => {
		for (const pattern of specifierPatterns) {
			const match = pattern.exec(text);
			if (!match?.[1]) continue;
			const reason = classify(file, match[1]);
			if (reason) {
				findings.push({ file, line: index + 1, reason, specifier: match[1] });
			}
		}
	});
	return findings;
}

async function main(): Promise<void> {
	const files = await collectFiles(BACKEND_SRC);
	const findings: Finding[] = [];
	for (const file of files) {
		findings.push(...scan(file, await readFile(file, 'utf8')));
	}
	if (findings.length === 0) {
		console.log(`check-backend-cli-boundary: OK (${files.length} files scanned)`);
		return;
	}
	console.error('check-backend-cli-boundary: backend/src must not import cli/src.');
	console.error(
		'Move shared contracts/helpers into aidd-shared and import via the package name.\n',
	);
	for (const finding of findings) {
		const rel = finding.file.split(sep).join('/');
		console.error(`  ${rel}:${finding.line}  ${finding.specifier}  (${finding.reason})`);
	}
	exit(1);
}

await main();
