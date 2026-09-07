import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { cwd, exit } from 'node:process';

/**
 * Enforces: the 300-line-per-file modularity rule, across the tracked source trees. No assertion
 * ID: the rule is stated in `AGENTS.md` rather than in the assertion catalog.
 *
 * Any tracked `.ts`/`.tsx` source file over `MAX_LINES` fails `smoke:qc`, so oversized files must be
 * split before landing. The threshold is a hard ceiling with no grandfather list.
 */

const MAX_LINES = 300;
const WARNING_LINES = 290;
const scannedRoots = ['cli/src', 'backend/src', 'frontend/src', 'shared/src', 'scripts'];
const skippedDirs = new Set(['build', 'dist', 'node_modules', 'snapshots']);

interface Finding {
	file: string;
	lines: number;
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

function countLines(text: string): number {
	if (text.length === 0) return 0;
	const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
	return withoutTrailingNewline.split(/\r?\n/).length;
}

export async function runCheckMaxLines(projectRoot = cwd()): Promise<number> {
	const findings: Finding[] = [];
	const warnings: Finding[] = [];
	let examined = 0;
	for (const root of scannedRoots) {
		const fullRoot = join(projectRoot, root);
		try {
			await stat(fullRoot);
		} catch {
			continue;
		}
		const files = await collectFiles(fullRoot);
		examined += files.length;
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			const lines = countLines(text);
			if (lines > MAX_LINES) {
				const relPath = relative(projectRoot, file).split(sep).join('/');
				findings.push({ file: relPath, lines });
			} else if (lines >= WARNING_LINES) {
				const relPath = relative(projectRoot, file).split(sep).join('/');
				warnings.push({ file: relPath, lines });
			}
		}
	}

	if (findings.length > 0) {
		findings.sort((a, b) => b.lines - a.lines);
		console.error(
			`[FAIL] aidd max-lines check: ${findings.length} file(s) exceed ${MAX_LINES} lines.`,
		);
		console.error(
			'Split oversized files into cohesive modules (facade + submodules / extracted components).',
		);
		for (const finding of findings) {
			console.error(`- ${finding.file}:${finding.lines} (max ${MAX_LINES})`);
		}
		return 1;
	}

	// Rule 5. Every scanned root is skipped when absent, so a rename or a wrong `projectRoot`
	// leaves nothing to walk and the check reports the same pass it would over a clean tree.
	// `${MAX_LINES}` below is a threshold, not a count; the count has to be stated separately.
	if (examined === 0) {
		console.error('[FAIL] aidd max-lines check examined no files.');
		console.error(
			`None of the scanned roots exist under ${projectRoot}: ${scannedRoots.join(', ')}.`,
		);
		return 1;
	}

	if (warnings.length > 0) {
		warnings.sort((left, right) => right.lines - left.lines);
		console.warn(
			`[WARN] aidd max-lines check: ${warnings.length} file(s) are at ${WARNING_LINES}-${MAX_LINES} lines.`,
		);
		console.warn('Split these modules before adding behavior so the next edit stays green.');
		for (const warning of warnings) {
			console.warn(
				`- ${warning.file}:${warning.lines} (warn ${WARNING_LINES}, max ${MAX_LINES})`,
			);
		}
	}

	console.log(
		`[OK] aidd max-lines check passed (${examined} file(s) examined, ` +
			`none exceeds ${MAX_LINES} lines).`,
	);
	return 0;
}

if (import.meta.main) {
	exit(await runCheckMaxLines());
}
