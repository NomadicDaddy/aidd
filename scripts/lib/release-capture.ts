import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { releaseSource, type ReleaseSource, releaseVersion, sha256 } from './release-build.ts';

export const RELEASE_VIEWPORT = { height: 1309, width: 2250 } as const;

interface CaptureScope {
	check404: boolean;
	page: null | string;
	startFrom: null | string;
	viewport: { height: number; width: number };
}

interface CaptureContract {
	routes: string[];
	schema: number;
	viewport: { height: number; width: number };
}

interface ReleaseBuild {
	assets: { file: string; sha256: string }[];
	mode: string;
	source: null | ReleaseSource;
	timestamp: string;
	version: string;
}

interface CaptureReport {
	summary: { screenshotsTaken: number; success: boolean };
	visitedUrls: string[];
}

export interface ReleaseCapture {
	contract: CaptureContract;
	directory: string;
	release: boolean;
	run: string;
	scope: CaptureScope;
	source: ReleaseSource;
	version: string;
}

function writeJson(file: string, value: unknown): void {
	const temporary = `${file}.${randomUUID()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, '\t')}\n`);
	renameSync(temporary, file);
}

/** Full attempts replace the authoritative pointer immediately; diagnostic runs never do. */
export function beginReleaseCapture(
	root: string,
	versionDirectory: string,
	scope: CaptureScope,
): ReleaseCapture {
	const contract = JSON.parse(
		readFileSync(join(root, '.screenshot-capture'), 'utf8'),
	) as CaptureContract;
	if (
		contract.schema !== 1 ||
		!Array.isArray(contract.routes) ||
		contract.routes.length < 5 ||
		contract.viewport?.width !== RELEASE_VIEWPORT.width ||
		contract.viewport.height !== RELEASE_VIEWPORT.height
	) {
		throw new Error('Release capture requires a versioned route coverage contract.');
	}
	const run = randomUUID();
	const directory = join(versionDirectory, 'runs', run);
	mkdirSync(directory, { recursive: true });
	const capture = {
		contract,
		directory,
		release:
			scope.page === null &&
			scope.startFrom === null &&
			scope.check404 &&
			scope.viewport.width === contract.viewport.width &&
			scope.viewport.height === contract.viewport.height,
		run,
		scope,
		source: releaseSource(root),
		version: releaseVersion(root),
	};
	writeJson(join(directory, 'crawl-result.json'), {
		...capture,
		status: 'started',
		success: false,
	});
	if (capture.release) {
		writeJson(join(versionDirectory, 'release-run.json'), { run });
	}
	return capture;
}

/** Compare every emitted asset to the origin, rather than trusting a version label or HTML alone. */
export async function captureReleaseBuild(root: string, baseUrl: string): Promise<ReleaseBuild> {
	const disk = readFileSync(join(root, 'frontend', 'dist', 'release-build.json'), 'utf8');
	const response = await fetch(new URL('/release-build.json', baseUrl), {
		signal: AbortSignal.timeout(45_000),
	});
	if (!response.ok || (await response.text()) !== disk) {
		throw new Error(
			'The served production build does not match frontend/dist/release-build.json.',
		);
	}
	const build = JSON.parse(disk) as ReleaseBuild;
	if (build.mode !== 'production' || !build.source?.clean || build.assets.length === 0) {
		throw new Error('The production build must identify a clean committed source tree.');
	}
	if (JSON.stringify(build.source) !== JSON.stringify(releaseSource(root))) {
		throw new Error('The production build does not identify the current clean candidate.');
	}
	for (const asset of build.assets) {
		if (!/^[\w./-]+$/.test(asset.file) || asset.file.split('/').includes('..')) {
			throw new Error('Invalid production asset path.');
		}
		const served = await fetch(new URL(`/${asset.file}`, baseUrl), {
			signal: AbortSignal.timeout(45_000),
		});
		let servedBytes = new Uint8Array(await served.arrayBuffer());
		if (asset.file === 'index.html') {
			// aidd's static server adds this config marker; remove exactly its insertion.
			const html = new TextDecoder()
				.decode(servedBytes)
				.replace(
					/\t\t<meta name="aidd-trace-default" content="(?:true|false)" \/>\n\t(?=<\/head>)|^<meta name="aidd-trace-default" content="(?:true|false)" \/>/g,
					'',
				);
			servedBytes = new TextEncoder().encode(html);
		}
		if (
			!served.ok ||
			sha256(servedBytes) !== asset.sha256 ||
			sha256(readFileSync(join(root, 'frontend', 'dist', asset.file))) !== asset.sha256
		) {
			throw new Error(`Production asset differs from the built candidate: ${asset.file}`);
		}
	}
	return build;
}

/** Finalize only after the crawl AND its analyzer; preserve their report beside the exact images. */
export async function finishReleaseCapture(
	root: string,
	baseUrl: string,
	capture: ReleaseCapture,
	report: CaptureReport,
	analyzerFailures: string[],
	images: { file: string; route: string }[],
	buildBefore: null | ReleaseBuild,
): Promise<boolean> {
	const failures = [...analyzerFailures];
	let build: null | ReleaseBuild = null;
	if (capture.release) {
		try {
			build = await captureReleaseBuild(root, baseUrl);
			if (JSON.stringify(buildBefore) !== JSON.stringify(build)) {
				failures.push(
					'The served build changed during capture or was not verified at startup.',
				);
			}
		} catch (err) {
			failures.push(err instanceof Error ? err.message : String(err));
		}
		if (JSON.stringify(capture.source) !== JSON.stringify(build?.source)) {
			failures.push('The captured candidate differs from the verified production source.');
		}
	}
	if (!report.summary.success) failures.push('The crawl failed.');
	const routes = report.visitedUrls.map((value) => {
		const url = new URL(value, baseUrl);
		return url.pathname + url.search;
	});
	for (const pattern of capture.release ? capture.contract.routes : []) {
		if (!routes.some((route) => new RegExp(`^(?:${pattern})$`).test(route))) {
			failures.push(`Missing required route: ${pattern}`);
		}
	}
	for (const route of routes) {
		if (!images.some((image) => image.route === route))
			failures.push(`Missing screenshot: ${route}`);
	}
	const inventory = images.map((image) => ({
		...image,
		sha256: sha256(readFileSync(join(capture.directory, image.file))),
	}));
	const files = readdirSync(capture.directory)
		.filter((file) => file.endsWith('.png'))
		.sort();
	if (
		JSON.stringify(files) !== JSON.stringify(images.map((image) => image.file).sort()) ||
		files.length !== report.summary.screenshotsTaken
	)
		failures.push('Screenshot inventory is incomplete.');
	const reportText = `${JSON.stringify(report, null, '\t')}\n`;
	writeFileSync(join(capture.directory, 'report.json'), reportText);
	const reportSha256 = sha256(reportText);
	const status = failures.length > 0 ? 'failed' : capture.release ? 'passed' : 'diagnostic';
	writeJson(join(capture.directory, 'crawl-result.json'), {
		analyzer: { failures, reportSha256, success: failures.length === 0 },
		build,
		candidate: capture.source,
		contract: capture.contract,
		images: inventory,
		reportSha256,
		routes,
		run: capture.run,
		schema: 1,
		scope: capture.scope,
		status,
		success: status === 'passed',
		timestamp: new Date().toISOString(),
		version: capture.version,
	});
	for (const failure of failures) console.error(`[release capture] ${failure}`);
	return failures.length === 0;
}
