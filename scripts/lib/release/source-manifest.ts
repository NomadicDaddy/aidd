/**
 * The record that makes the source offer fulfillable.
 *
 * licenses/SOURCE-OFFER.md promises the exact Bun/WebKit/TinyCC sources and relink materials for
 * "the exact Bun version identified in the artifact". A written offer is optional; honouring one
 * you have distributed is not. That promise is only keepable if, years later, we can still say
 * which sources a given binary was built from — so every release carries this manifest inside the
 * archive, and the same facts are retained in-repo keyed by the artifact's SHA-256.
 *
 * Without it the offer names revisions nobody recorded.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SourceRevisions {
	aiddCommit: string;
	aiddVersion: string;
	bunTag: string;
	bunVersion: string;
	lockfileSha256: string;
}

/**
 * This manifest is the thing that makes the LGPL source offer fulfillable: it is how a recipient
 * maps the binary they downloaded back to the sources it was built from. A manifest reading "aidd
 * commit `unknown`, Bun unknown (tag `bun-vunknown`)" is an offer that points at nothing — worse
 * than no manifest, because it looks like one. So every field here fails the release rather than
 * substituting a placeholder. (pinnedBunVersion in generate-third-party-licenses.ts already exits
 * on the same missing field; this was the one path that shrugged.)
 */
async function gitCommit(rootDir: string): Promise<string> {
	let stdout: string;
	try {
		// Bun.spawn throws ENOENT for a missing binary instead of returning a non-zero exit.
		const proc = Bun.spawn(['git', '-C', rootDir, 'rev-parse', 'HEAD'], {
			stderr: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		stdout = await new Response(proc.stdout).text();
		if ((await proc.exited) !== 0) stdout = '';
	} catch {
		stdout = '';
	}

	const commit = stdout.trim();
	if (!/^[0-9a-f]{40}$/.test(commit)) {
		throw new Error(
			'Cannot read the aidd commit from git, so the source manifest could not name the ' +
				'sources this release was built from. Package from a git checkout with git on PATH.'
		);
	}
	return commit;
}

export async function collectSourceRevisions(
	rootDir: string,
	version: string
): Promise<SourceRevisions> {
	const manifest = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8')) as {
		packageManager?: string;
	};
	const bunVersion = manifest.packageManager?.match(/^bun@(.+)$/)?.[1];
	if (bunVersion === undefined) {
		throw new Error(
			'package.json has no `packageManager: "bun@<version>"`, so the source manifest cannot ' +
				'name the Bun tag whose submodules pin the LGPL components the binaries link.'
		);
	}
	const lockfile = await readFile(join(rootDir, 'bun.lock')).catch(() => Buffer.from(''));

	return {
		aiddCommit: await gitCommit(rootDir),
		aiddVersion: version,
		bunTag: `bun-v${bunVersion}`,
		bunVersion,
		lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
	};
}

/** Ships inside the archive: what this binary was built from, and how to relink it. */
export function renderSourceManifest(revisions: SourceRevisions): string {
	return `# Source manifest

The exact sources this artifact was built from. [\`SOURCE-OFFER.md\`](./SOURCE-OFFER.md) offers to
supply them, and the LGPL relink materials, for at least three years; this file is what that offer
points at, so a recipient can identify the sources for the binary they actually hold rather than
whatever upstream happens to be today.

| Component | Revision |
| --------- | -------- |
| aidd version | ${revisions.aiddVersion} |
| aidd commit | \`${revisions.aiddCommit}\` |
| Bun | ${revisions.bunVersion} (tag \`${revisions.bunTag}\`) |
| Dependency lockfile (bun.lock) SHA-256 | \`${revisions.lockfileSha256}\` |

**Bun and its statically linked LGPL components**

- Bun: <https://github.com/oven-sh/bun> at \`${revisions.bunTag}\`. That tree pins the exact
  WebKit/JavaScriptCore and TinyCC revisions used, as git submodules — the submodule commits in
  that tag are the authoritative revisions, not the current tips of those repositories.
- Patched WebKit/JavaScriptCore: <https://github.com/oven-sh/webkit>, at the commit that tag pins.
- TinyCC: <https://github.com/TinyCC/tinycc>, at the commit that tag pins.

**Rebuilding and relinking**

1. Build Bun from \`${revisions.bunTag}\` with your modified LGPL component:
   \`git submodule update --init --recursive\`, \`make jsc\`, \`zig build\`.
2. Rebuild this executable with that Bun: \`bun run build:standalone\` (which runs
   \`bun build --compile\`) from aidd commit \`${revisions.aiddCommit}\`.

The result carries your modified JavaScriptCore. aidd's own code stays under FSL-1.1-ALv2; the
LGPL applies to the linked library, not to the program that links it.
`;
}

/** Retained in-repo, keyed by artifact hash: the record the offer is answered from. */
export function renderReleaseRecord(
	revisions: SourceRevisions,
	artifacts: { name: string; sha256: string }[]
): string {
	return `# Release ${revisions.aiddVersion} — source record

Retained so the corresponding-source offer in \`licenses/SOURCE-OFFER.md\` can be answered for this
release. A recipient identifies their artifact by the SHA-256 below; these are the sources it was
built from. Do not delete this file while the offer is live (at least three years after the last
distribution of these artifacts).

## Artifacts

| Artifact | SHA-256 |
| -------- | ------- |
${artifacts.map((artifact) => `| ${artifact.name} | \`${artifact.sha256}\` |`).join('\n')}

## Sources

| Component | Revision |
| --------- | -------- |
| aidd commit | \`${revisions.aiddCommit}\` |
| Bun | ${revisions.bunVersion} (tag \`${revisions.bunTag}\`, which pins the WebKit and TinyCC submodule commits) |
| Dependency lockfile (bun.lock) SHA-256 | \`${revisions.lockfileSha256}\` |
`;
}
