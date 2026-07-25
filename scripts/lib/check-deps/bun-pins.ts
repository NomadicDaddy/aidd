import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The Bun version naming the LGPL corresponding source.
 *
 * The release source manifest and THIRD-PARTY-LICENSES.md derive the Bun version solely from
 * `package.json` `packageManager`, but the binaries are compiled by Bun pinned independently in
 * the CI/release workflows and the Dockerfile. Bumping one without the other makes the source
 * offer name a `bun-v<X>` tag whose WebKit/JavaScriptCore (LGPL-2) and TinyCC (LGPL-2.1)
 * submodule commits are NOT the ones statically linked into the binary a recipient downloaded.
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
 * construction; their absence is not a finding. The Dockerfile cannot reference the manifest,
 * so its `FROM oven/bun:` pin remains literal and must be compared.
 */
export async function checkBunPinDrift(
	projectRoot: string,
	pinnedVersion: string,
): Promise<BunPinFinding[]> {
	const findings: BunPinFinding[] = [];

	findings.push(...(await checkWorkflowPins(projectRoot, pinnedVersion)));
	findings.push(...(await checkDockerfilePin(projectRoot, pinnedVersion)));

	return findings;
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
						'The release source manifest identifies the LGPL corresponding source by the ' +
						'packageManager version, so a mismatch makes the source offer name the wrong Bun tag.',
					severity: 'error',
				});
			}
		}
	}

	return findings;
}

async function checkDockerfilePin(
	projectRoot: string,
	pinnedVersion: string,
): Promise<BunPinFinding[]> {
	const findings: BunPinFinding[] = [];

	const dockerfilePath = join(projectRoot, 'Dockerfile');
	let content: string;
	try {
		content = await readFile(dockerfilePath, 'utf8');
	} catch {
		// A derived project may have no Dockerfile — do not fail on mere absence.
		return findings;
	}

	for (const match of content.matchAll(/^FROM\s+oven\/bun:([^@\s]+)/gm)) {
		const found = match[1];
		if (found !== pinnedVersion) {
			findings.push({
				message:
					`Dockerfile pins Bun \`${found}\` in a FROM oven/bun line but package.json pins ` +
					`\`${pinnedVersion}\`. The release source manifest identifies the LGPL corresponding ` +
					'source by the packageManager version, so a mismatch makes the source offer name the ' +
					'wrong Bun tag.',
				severity: 'error',
			});
		}
	}

	return findings;
}
