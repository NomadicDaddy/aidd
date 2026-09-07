import type { Plugin } from 'vite';

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { releaseSource, releaseVersion, sha256 } from '../scripts/lib/release-build.ts';

/** A production artifact identifies its source and its emitted bytes, even after a rebuild. */
export function releaseBuildPlugin(root: string): Plugin {
	let source: null | ReturnType<typeof releaseSource> = null;
	return {
		apply: 'build',
		buildStart() {
			try {
				source = releaseSource(root);
			} catch {
				// Source archives can build normally, but cannot attest a local tag capture.
				source = null;
			}
		},
		name: 'release-build-evidence',
		writeBundle(options, bundle) {
			const directory = options.dir ?? join(root, 'frontend', 'dist');
			const assets = Object.keys(bundle)
				.sort()
				.map((file) => ({
					file,
					sha256: sha256(readFileSync(join(directory, file))),
				}));
			let unchanged = false;
			try {
				unchanged = JSON.stringify(source) === JSON.stringify(releaseSource(root));
			} catch {
				// No Git checkout means no release attestation.
			}
			writeFileSync(
				join(directory, 'release-build.json'),
				JSON.stringify({
					assets,
					mode: 'production',
					source: source && unchanged ? source : null,
					timestamp: new Date().toISOString(),
					version: releaseVersion(root),
				}),
			);
		},
	};
}
