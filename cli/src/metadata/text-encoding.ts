import { metadataPath } from 'aidd-shared/metadata/paths';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export interface TextEncodingViolation {
	path: string;
	reason: string;
}

const promptArtifactExtensions = new Set(['.json', '.md', '.txt']);
const skippedAiddDirs = new Set(['audit-reports', 'iterations', 'responses']);
const rootPromptArtifacts = ['AGENTS.md', 'CLAUDE.md'];

export async function findPromptArtifactEncodingViolations(
	projectDir: string,
): Promise<TextEncodingViolation[]> {
	const candidates = [
		...rootPromptArtifacts.map((path) => join(projectDir, path)),
		...(await collectAiddPromptArtifacts(projectDir)),
	];
	const violations: TextEncodingViolation[] = [];
	for (const candidate of candidates) {
		const buffer = await readFile(candidate).catch(() => undefined);
		if (!buffer) continue;
		const reason = detectTextEncodingViolation(buffer);
		if (reason) {
			violations.push({
				path: relative(projectDir, candidate).replaceAll('\\', '/'),
				reason,
			});
		}
	}
	return violations;
}

export function detectTextEncodingViolation(buffer: Buffer): string | undefined {
	if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
		return 'UTF-16LE BOM';
	}
	if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
		return 'UTF-16BE BOM';
	}

	const sampleLength = Math.min(buffer.length, 8192);
	let evenNuls = 0;
	let oddNuls = 0;
	for (let index = 0; index < sampleLength; index++) {
		if (buffer[index] !== 0) continue;
		if (index % 2 === 0) evenNuls++;
		else oddNuls++;
	}
	const nulCount = evenNuls + oddNuls;
	const nulRatio = nulCount / Math.max(sampleLength, 1);
	const dominantLaneRatio = Math.max(evenNuls, oddNuls) / Math.max(sampleLength, 1);
	if (nulRatio > 0.2 && dominantLaneRatio > 0.15) {
		return 'UTF-16-like NUL byte pattern';
	}
	return undefined;
}

async function collectAiddPromptArtifacts(projectDir: string): Promise<string[]> {
	const metadataDir = metadataPath(projectDir);
	const results: string[] = [];
	await collectPromptArtifacts(metadataDir, results, metadataDir);
	return results;
}

async function collectPromptArtifacts(
	dir: string,
	results: string[],
	metadataDir: string,
): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (dir === metadataDir && skippedAiddDirs.has(entry.name)) continue;
			await collectPromptArtifacts(fullPath, results, metadataDir);
			continue;
		}
		if (!entry.isFile()) continue;
		if (promptArtifactExtensions.has(extname(entry.name).toLowerCase())) {
			results.push(fullPath);
		}
	}
}
