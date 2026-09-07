import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildRevision } from './buildRevision.ts';
import { releaseBuildPlugin } from './releaseBuildPlugin.ts';
import { type BundleArtifact, hashBundleArtifacts } from '../scripts/lib/bundle-artifact-hash.ts';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';

type PackageJson = {
	repository?: { url?: unknown } | string;
	version?: unknown;
};

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(frontendRoot);
const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
const buildTimestamp = new Date().toISOString();

const buildRevision = readBuildRevision(frontendRoot);

// `git+https://….git` is the package-manager form; About links a human at it, so normalise to the
// browsable URL rather than shipping a clone address into the page.
const rawRepository =
	typeof packageJson.repository === 'string'
		? packageJson.repository
		: typeof packageJson.repository?.url === 'string'
			? packageJson.repository.url
			: '';
const repositoryUrl = rawRepository.replace(/^git\+/, '').replace(/\.git$/, '');

// Analysis is an opt-in overlay on the ordinary production build rather than a separate `--mode`,
// so what it measures is byte-for-byte what `build:frontend` ships. Set by `bun run build:analyze`.
const analyzeBundle = process.env.AIDD_BUILD_ANALYZE === '1';
const analysisDir = join(repositoryRoot, 'data', 'build-analysis');

/** Repo-relative and POSIX-slashed, so the report reads the same on every platform. */
function toEntryPath(moduleId: string): string {
	const normalized = moduleId.replace(/^\0/, '').split('?')[0] ?? moduleId;
	const fromRoot = relative(repositoryRoot, normalized).split(sep).join('/');
	return fromRoot === '' || fromRoot.startsWith('..') ? normalized : fromRoot;
}

/**
 * Writes the machine-readable half of the analysis.
 *
 * rollup-plugin-visualizer renders the treemap a human reads; this emits the same composition as
 * stable JSON, which is what `check:bundle-analysis` compares across builds. Reading the
 * visualizer's own template payload instead would couple the gate to that template's schema.
 *
 * Runs at `writeBundle` rather than `generateBundle`: Vite's own post plugins rewrite chunks and
 * minify CSS after a user plugin's `generateBundle`, so the in-memory bundle there is off by
 * kilobytes from what ships. Sizes and the artifact hash are read back off disk instead, which is
 * the same output `check:bundle-analysis` re-hashes.
 */
function bundleAnalysisManifest(): Plugin {
	return {
		name: 'aidd-bundle-analysis',
		writeBundle(options, bundle) {
			const outDir = options.dir ?? join(frontendRoot, 'dist');
			const chunks: { bytes: number; entry: boolean; path: string }[] = [];
			const modules = new Map<string, number>();
			const artifacts: BundleArtifact[] = [];

			for (const [fileName, output] of Object.entries(bundle)) {
				const bytes = readFileSync(join(outDir, ...fileName.split('/')));
				chunks.push({
					bytes: bytes.byteLength,
					entry: output.type === 'chunk' && output.isEntry,
					path: fileName,
				});
				artifacts.push({ bytes, fileName });
				if (output.type !== 'chunk') continue;
				for (const [moduleId, info] of Object.entries(output.modules)) {
					const path = toEntryPath(moduleId);
					modules.set(path, (modules.get(path) ?? 0) + (info.renderedLength ?? 0));
				}
			}

			const byBytes = <T extends { bytes: number }>(left: T, right: T): number =>
				right.bytes - left.bytes;
			mkdirSync(analysisDir, { recursive: true });
			writeFileSync(
				join(analysisDir, 'frontend-stats.json'),
				`${JSON.stringify(
					{
						// Binds the report to the bytes it describes: the revision alone still
						// matches a different dirty build, or a later plain `build:frontend`.
						artifactHash: hashBundleArtifacts(artifacts),
						chunks: chunks.sort(byBytes),
						generatedAt: new Date().toISOString(),
						modules: [...modules]
							.map(([path, bytes]) => ({ bytes, path }))
							.sort(byBytes),
						revision: buildRevision,
						version: appVersion,
					},
					null,
					'\t',
				)}\n`,
			);
		},
	};
}

export default defineConfig({
	define: {
		__AIDD_BUILD_REVISION__: JSON.stringify(buildRevision),
		__AIDD_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
		__AIDD_REPOSITORY_URL__: JSON.stringify(repositoryUrl),
		__AIDD_VERSION__: JSON.stringify(appVersion),
	},
	plugins: [
		releaseBuildPlugin(repositoryRoot),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
		...(analyzeBundle
			? [
					bundleAnalysisManifest(),
					visualizer({
						brotliSize: false,
						// Outside the build output: the treemap is a local diagnostic and must
						// never reach a release archive or the served panel.
						emitFile: false,
						filename: join(analysisDir, 'frontend-stats.html'),
						gzipSize: true,
						open: false,
						template: 'treemap',
						title: `aidd frontend bundle ${appVersion} (${buildRevision})`,
					}) as Plugin,
				]
			: []),
	],
	root: frontendRoot,
});
