import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { currentRevision } from '../../scripts/check-bundle-analysis.ts';
import { hashBundleArtifacts } from '../../scripts/lib/bundle-artifact-hash.ts';

/**
 * Writes the build:analyze report pair that check:bundle-analysis accepts for a tree whose only
 * chunk is frontend/dist/assets/index.js, at the tree's current revision. Overrides replace a
 * file's text, to make the report corrupt or empty.
 * @param root The project root.
 * @param overrides Replacement text for either report file.
 */
export async function writeAcceptedAnalysis(
	root: string,
	overrides: { html?: string; json?: string } = {},
): Promise<void> {
	const bytes = await readFile(join(root, 'frontend', 'dist', 'assets', 'index.js'));
	const analysis = {
		artifactHash: hashBundleArtifacts([{ bytes, fileName: 'assets/index.js' }]),
		chunks: [{ bytes: bytes.length, entry: true, path: 'assets/index.js' }],
		generatedAt: '2026-10-14T00:00:00.000Z',
		modules: [{ bytes: bytes.length, path: 'frontend/src/main.ts' }],
		revision: currentRevision(root) ?? 'unknown',
		version: '1',
	};
	const directory = join(root, 'data', 'build-analysis');
	await mkdir(directory, { recursive: true });
	const json = overrides.json ?? JSON.stringify(analysis);
	await writeFile(join(directory, 'frontend-stats.json'), json);
	await writeFile(join(directory, 'frontend-stats.html'), overrides.html ?? '<html></html>');
}
