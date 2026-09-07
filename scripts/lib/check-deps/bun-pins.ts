import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The Bun version the repository pins.
 *
 * aidd ships as source, so Bun is a hard prerequisite rather than something bundled: whatever
 * `package.json` `packageManager` names is the runtime contributors install, the runtime
 * `scripts/require-bun.ts` enforces, and the runtime the docs tell downloaders to get. A workflow
 * that pins a different Bun literal means CI proves the gate against a runtime nobody else runs.
 *
 * This module compares the manifest pin against every remaining literal pin and emits findings.
 */

export interface BunPinFinding {
	message: string;
	severity: 'error' | 'warn';
}

/** Reads the pinned Bun version from `package.json` `packageManager`, or null if absent. */
export async function readPinnedBunVersion(projectRoot: string): Promise<null | string> {
	const content = await readFile(join(projectRoot, 'package.json'), 'utf8');
	const pkg = JSON.parse(content) as { packageManager?: string };
	return pkg.packageManager?.match(/^bun@(.+)$/)?.[1] ?? null;
}

/**
 * Compares the manifest pin against every literal Bun pin. Workflows that use
 * `bun-version-file: package.json` have no literal `bun-version:` and are in agreement by
 * construction; their absence is not a finding.
 */
export async function checkBunPinDrift(
	projectRoot: string,
	pinnedVersion: string,
): Promise<BunPinFinding[]> {
	return await checkWorkflowPins(projectRoot, pinnedVersion);
}

async function checkWorkflowPins(
	projectRoot: string,
	pinnedVersion: string,
): Promise<BunPinFinding[]> {
	const findings: BunPinFinding[] = [];

	const workflowsDir = join(projectRoot, '.github', 'workflows');
	let workflowFiles: string[];
	try {
		workflowFiles = await readdir(workflowsDir);
	} catch {
		// A derived project may have no workflows directory — do not fail on mere absence.
		return findings;
	}

	for (const file of workflowFiles) {
		if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
		const filePath = join(workflowsDir, file);
		let content: string;
		try {
			content = await readFile(filePath, 'utf8');
		} catch {
			findings.push({
				message: `Could not read .github/workflows/${file}.`,
				severity: 'warn',
			});
			continue;
		}

		for (const match of content.matchAll(/^\s*bun-version:\s*(\S+)/gm)) {
			const found = match[1];
			if (found !== pinnedVersion) {
				findings.push({
					message:
						`.github/workflows/${file} pins Bun \`${found}\` but package.json pins \`${pinnedVersion}\`. ` +
						'CI would then prove the gate against a runtime no contributor or downloader runs.',
					severity: 'error',
				});
			}
		}
	}

	return findings;
}
