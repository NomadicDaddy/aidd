import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	ANALYSIS_DIR,
	type BundleAnalysis,
	currentRevision,
	DIST_DIR,
	inspectAnalysis,
	STATS_HTML,
	STATS_JSON,
} from '../../scripts/check-bundle-analysis.ts';
import { hashBundleArtifacts } from '../../scripts/lib/bundle-artifact-hash.ts';

const REVISION = 'abcdef12';

/** The build the report describes: written into the fixture's frontend/dist by `beforeEach`. */
const DIST_FILES: Record<string, string> = {
	'assets/index-aaaa.js': 'console.log("app");\n',
	'index.html': '<!doctype html><div id="root"></div>\n',
};

function validAnalysis(): BundleAnalysis {
	return {
		artifactHash: hashBundleArtifacts(
			Object.entries(DIST_FILES).map(([fileName, bytes]) => ({ bytes, fileName })),
		),
		chunks: Object.entries(DIST_FILES).map(([path, content]) => ({
			bytes: Buffer.byteLength(content),
			entry: path.endsWith('.js'),
			path,
		})),
		generatedAt: new Date().toISOString(),
		modules: [{ bytes: 2048, path: 'frontend/src/main.tsx' }],
		revision: REVISION,
		version: '3.0.0',
	};
}

describe('check:bundle-analysis', () => {
	let root: string;

	function distPath(path: string): string {
		return join(root, DIST_DIR, ...path.split('/'));
	}

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'aidd-bundle-analysis-'));
		mkdirSync(join(root, 'frontend', 'src'), { recursive: true });
		writeFileSync(join(root, 'frontend', 'src', 'main.tsx'), 'export const app = 1;\n');
		mkdirSync(join(root, ANALYSIS_DIR), { recursive: true });
		for (const [path, content] of Object.entries(DIST_FILES)) {
			mkdirSync(dirname(distPath(path)), { recursive: true });
			writeFileSync(distPath(path), content);
		}
	});

	afterEach(async () => {
		await removeTempTree(root);
	});

	/**
	 * Writes the report after the sources it describes. Windows stamps mtimes on a ~15.6ms tick, so
	 * a same-tick write would make a fresh report look exactly as old as its inputs.
	 */
	async function writeAnalysis(analysis: unknown, html = '<html>treemap</html>'): Promise<void> {
		await Bun.sleep(20);
		writeFileSync(join(root, ANALYSIS_DIR, STATS_HTML), html);
		writeFileSync(
			join(root, ANALYSIS_DIR, STATS_JSON),
			typeof analysis === 'string' ? analysis : JSON.stringify(analysis),
		);
	}

	test('accepts a report generated from the current revision and the built dist', async () => {
		await writeAnalysis(validAnalysis());

		expect(inspectAnalysis(root, REVISION)).toEqual([]);
	});

	test('rejects a report whose chunk was rebuilt underneath it', async () => {
		// The failure the revision check cannot see: a plain `build:frontend` (or a second dirty
		// build) at the same HEAD leaves the report attributing bytes that are no longer shipped.
		await writeAnalysis(validAnalysis());
		writeFileSync(distPath('assets/index-aaaa.js'), 'console.log("other app");\n');

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${ANALYSIS_DIR}/${STATS_JSON} describes a different build than ${DIST_DIR}; ` +
				'rerun "bun run build:analyze"',
		]);
	});

	test('reports a chunk the report names but frontend/dist does not have', async () => {
		await writeAnalysis(validAnalysis());
		rmSync(distPath('assets/index-aaaa.js'));

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${DIST_DIR}/assets/index-aaaa.js is missing; rerun "bun run build:analyze"`,
		]);
	});

	test('collapses a wholly rebuilt dist into one finding', async () => {
		// Chunk names carry a content hash, so a rebuild renames almost every file at once; the
		// gate must not answer that with one line per chunk.
		await writeAnalysis(validAnalysis());
		for (const path of Object.keys(DIST_FILES)) rmSync(distPath(path));

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${DIST_DIR}/assets/index-aaaa.js is missing (and 1 other chunk(s) it names); ` +
				'rerun "bun run build:analyze"',
		]);
	});

	test('rejects a report that carries no artifact hash', async () => {
		// A report predating the hash, or one hand-edited to drop it, cannot be bound to a build.
		const { artifactHash: _dropped, ...withoutHash } = validAnalysis();
		await writeAnalysis(withoutHash);

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${ANALYSIS_DIR}/${STATS_JSON} does not carry a bundle analysis`,
		]);
	});

	test('reports a missing analysis and stops there', () => {
		// One finding, not three: without the JSON there is nothing to say about its shape or age,
		// and the operator's next move is the same either way.
		const findings = inspectAnalysis(root, REVISION);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toContain(STATS_JSON);
		expect(findings[0]).toContain('bun run build:analyze');
	});

	test('reports a missing treemap alongside a usable manifest', async () => {
		await writeAnalysis(validAnalysis());
		rmSync(join(root, ANALYSIS_DIR, STATS_HTML));

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${ANALYSIS_DIR}/${STATS_HTML} is missing; the treemap was not written`,
		]);
	});

	test('reports an empty treemap', async () => {
		await writeAnalysis(validAnalysis(), '');

		expect(inspectAnalysis(root, REVISION)).toEqual([`${ANALYSIS_DIR}/${STATS_HTML} is empty`]);
	});

	test('reports unparseable JSON without throwing', async () => {
		await writeAnalysis('{ not json');

		const findings = inspectAnalysis(root, REVISION);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toContain('is not readable JSON');
	});

	test('rejects JSON that parses but carries no analysis', async () => {
		await writeAnalysis({ chunks: [], revision: 12 });

		expect(inspectAnalysis(root, REVISION)).toEqual([
			`${ANALYSIS_DIR}/${STATS_JSON} does not carry a bundle analysis`,
		]);
	});

	test('rejects an analysis that attributes nothing', async () => {
		// A build that emitted a well-formed but empty report is the failure mode a shape check
		// alone would pass: the gate would go green having measured no bytes at all.
		await writeAnalysis({ ...validAnalysis(), chunks: [], modules: [] });

		const findings = inspectAnalysis(root, REVISION);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toContain('attributes nothing');
		expect(findings[0]).toContain('0 chunk(s), 0 module(s)');
	});

	test('rejects an analysis built from another revision', async () => {
		await writeAnalysis({ ...validAnalysis(), revision: '99999999' });

		const findings = inspectAnalysis(root, REVISION);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toContain('was built from revision 99999999');
		expect(findings[0]).toContain(`the tree is at ${REVISION}`);
	});

	test('skips the revision assertion when the revision is unknown', async () => {
		// No git and no override: freshness still applies, but revision cannot be asserted, and
		// guessing a mismatch would fail every gate run outside a checkout.
		await writeAnalysis({ ...validAnalysis(), revision: '99999999' });

		expect(inspectAnalysis(root, null)).toEqual([]);
	});

	test('rejects an analysis older than the sources it describes', async () => {
		await writeAnalysis(validAnalysis());
		await Bun.sleep(20);
		writeFileSync(join(root, 'frontend', 'src', 'main.tsx'), 'export const app = 2;\n');

		const findings = inspectAnalysis(root, REVISION);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toContain('is older than frontend/src');
	});

	test('sees a source edit nested below the top level', async () => {
		mkdirSync(join(root, 'frontend', 'src', 'pages', 'runs'), { recursive: true });
		await writeAnalysis(validAnalysis());
		await Bun.sleep(20);
		writeFileSync(join(root, 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'), 'x\n');

		expect(inspectAnalysis(root, REVISION)).toHaveLength(1);
	});

	test('prefers an explicit build revision over git', () => {
		const previous = process.env.AIDD_BUILD_REVISION;
		process.env.AIDD_BUILD_REVISION = 'ABCDEF1234567890';
		try {
			expect(currentRevision(root)).toBe('abcdef12');
		} finally {
			if (previous === undefined) delete process.env.AIDD_BUILD_REVISION;
			else process.env.AIDD_BUILD_REVISION = previous;
		}
	});
});

describe('bundle analysis wiring', () => {
	test('runs in the canonical gate and keeps its output out of the tree', async () => {
		const steps = await Bun.file('scripts/lib/smoke-qc/steps.ts').text();
		expect(steps).toContain("command: ['bun', 'run', 'build:analyze']");

		// Classified for the cache, or assertSmokeCacheCoverage throws at smoke:qc startup.
		const dependencies = await Bun.file('scripts/lib/smoke-cache/dependencies.ts').text();
		expect(dependencies).toContain("'build:analyze':");

		// Gitignored, so the source archive a release publishes cannot carry a stats dump.
		const gitignore = readFileSync('.gitignore', 'utf8');
		expect(gitignore.split(/\r?\n/)).toContain(`${ANALYSIS_DIR.replace(/\\/g, '/')}/`);
	});

	test('leaves the ordinary production build free of the analysis overlay', async () => {
		// The overlay is opt-in through AIDD_BUILD_ANALYZE so `build:frontend` emits exactly what
		// it emitted before: a treemap or stats dump inside frontend/dist would ship to users.
		const config = await Bun.file('frontend/vite.config.ts').text();
		expect(config).toContain("process.env.AIDD_BUILD_ANALYZE === '1'");
		expect(config).toContain('emitFile: false');

		const packageJson = (await Bun.file('package.json').json()) as {
			scripts: Record<string, string>;
		};
		expect(packageJson.scripts['build:frontend']).toBe('bun run --cwd frontend build');
		expect(packageJson.scripts['build:analyze']).toBe(
			'bun run --cwd frontend build:analyze && bun run check:bundle-analysis',
		);
	});
});
