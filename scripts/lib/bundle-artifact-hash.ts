/**
 * Identity of a frontend build's emitted output, shared by the two sides that must agree on it:
 * the `aidd-bundle-analysis` plugin (frontend/vite.config.ts) stamps the hash into the report, and
 * `check:bundle-analysis` recomputes it from frontend/dist.
 *
 * A revision alone does not identify a build -- two dirty builds of the same HEAD, or a later
 * `build:frontend` over the same dist, both keep the revision and change the bytes.
 */
import { createHash } from 'node:crypto';

/** One emitted artifact: the name it lands under in the output directory, and its bytes. */
export interface BundleArtifact {
	bytes: string | Uint8Array;
	fileName: string;
}

/** Byte-order, not locale-order: the hash has to be reproducible on every machine. */
function byFileName(left: BundleArtifact, right: BundleArtifact): number {
	if (left.fileName < right.fileName) return -1;
	return left.fileName > right.fileName ? 1 : 0;
}

const SEPARATOR = Uint8Array.of(0);

/**
 * sha256 over every artifact in file-name order, each contributing its name, a NUL, then its bytes.
 * The NUL keeps the names unambiguous, so renaming a chunk cannot collide with editing its content.
 */
export function hashBundleArtifacts(artifacts: readonly BundleArtifact[]): string {
	const hash = createHash('sha256');
	for (const artifact of [...artifacts].sort(byFileName)) {
		hash.update(artifact.fileName, 'utf8');
		hash.update(SEPARATOR);
		if (typeof artifact.bytes === 'string') hash.update(artifact.bytes, 'utf8');
		else hash.update(artifact.bytes);
	}
	return hash.digest('hex');
}
