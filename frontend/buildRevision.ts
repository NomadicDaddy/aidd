/**
 * Where the frontend build gets the commit it stamps into the About page.
 *
 * aidd ships as source, and the three trees it builds from answer this question differently. A
 * developer checkout has `.git`. A release archive does not: GitHub generates it from the tag with
 * `git archive`, which strips `.git` entirely, so `git rev-parse` has nothing to read and the
 * install-time build used to die inside `bun install`. The bridge is `.build-revision`, a tracked
 * file holding `$Format:%H$` that `export-subst` in `.gitattributes` rewrites to the archived
 * commit. In an ordinary checkout that file still holds the unsubstituted literal, which is why the
 * file is consulted last and only when its content is a full hash.
 *
 * Both the placeholder and the `export-subst` attribute live in `frontend/`, next to the build that
 * needs them, because the repository's root `.gitattributes` is byte-identical to
 * `scaffolding/.gitattributes` by contract -- `check:scaffold` enforces it -- and an aidd-specific
 * rule there would ship to every scaffolded project.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tracked placeholder beside this module; `export-subst` rewrites it when the tree is exported. */
export const REVISION_EXPORT_FILE = '.build-revision';

export const NO_REVISION_MESSAGE =
	'Cannot determine the frontend build revision. Build from a Git checkout or set ' +
	'AIDD_BUILD_REVISION to the source commit.';

export const BAD_REVISION_MESSAGE =
	'AIDD_BUILD_REVISION must be an 8-to-40-character hexadecimal Git revision.';

/** What the override accepts: a short revision through a full SHA-1. */
const REVISION = /^[0-9a-f]{8,40}$/i;

/** What a substituted `$Format:%H$` looks like. The unsubstituted literal cannot match. */
const EXPORTED_REVISION = /^[0-9a-f]{40}$/i;

function fromGit(dir: string): string | undefined {
	try {
		return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
			cwd: dir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		}).trim();
	} catch {
		return undefined;
	}
}

function fromExportFile(dir: string): string | undefined {
	let contents: string;
	try {
		contents = readFileSync(join(dir, REVISION_EXPORT_FILE), 'utf8');
	} catch {
		return undefined;
	}
	const revision = contents.trim();
	return EXPORTED_REVISION.test(revision) ? revision : undefined;
}

/**
 * The 8-character revision this build identifies itself by.
 *
 * Order is override, then Git, then the exported placeholder. `AIDD_BUILD_REVISION` wins even when
 * it is empty or malformed: an override that is present and wrong is a caller mistake worth
 * reporting, not a reason to silently stamp a different commit than the one asked for.
 *
 * @param dir The frontend directory: where `.build-revision` sits, and a working directory Git can
 *   resolve `HEAD` from when the tree is a checkout.
 * @throws when no source answers, and when the answer is not a hexadecimal revision.
 */
export function readBuildRevision(
	dir: string,
	env: Record<string, string | undefined> = process.env,
): string {
	const override = env.AIDD_BUILD_REVISION?.trim();
	const revision = override ?? fromGit(dir) ?? fromExportFile(dir);

	if (revision === undefined) throw new Error(NO_REVISION_MESSAGE);
	if (!REVISION.test(revision)) throw new Error(BAD_REVISION_MESSAGE);

	return revision.slice(0, 8).toLowerCase();
}
