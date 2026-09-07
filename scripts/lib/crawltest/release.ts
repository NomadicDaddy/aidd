import type { CrawlReport, ViewportArg } from '../../crawltest-types.ts';
import type { captureReleaseBuild, ReleaseCapture } from '../release-capture.ts';

import { screenshotFilename } from '../../crawltest-screenshots.ts';
import { finishReleaseCapture } from '../release-capture.ts';
import { distIndexHash } from './build-identity.ts';
import { evaluateCrawlVitals } from './vitals-p75.ts';

export async function completeReleaseCapture(
	capture: ReleaseCapture,
	report: CrawlReport,
	baseUrl: string,
	viewports: ViewportArg[],
	buildBefore: Awaited<ReturnType<typeof captureReleaseBuild>> | null,
	crawlPassed: boolean,
): Promise<boolean> {
	const root = process.cwd();
	const failures = capture.release ? evaluateCrawlVitals(report, distIndexHash(root)) : [];
	if (!crawlPassed) failures.push('Crawl assertions failed.');
	const images = report.visitedUrls.flatMap((value) => {
		const url = new URL(value);
		const route = url.pathname + url.search;
		return viewports.map((viewport) => ({ file: screenshotFilename(route, viewport), route }));
	});
	return finishReleaseCapture(root, baseUrl, capture, report, failures, images, buildBefore);
}
