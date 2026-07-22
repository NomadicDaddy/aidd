import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { CrawlReport, WebVitalEntry } from './crawltest-types.ts';

export interface WrittenCrawlReport {
	jsonPath: string;
	summaryPath: string;
}

function formatVitalValue(entry: WebVitalEntry): string {
	if (entry.name === 'CLS') return entry.value.toFixed(3);
	return `${Math.round(entry.value)}ms`;
}

function latestVitals(report: CrawlReport): WebVitalEntry[] {
	const latest = new Map<string, WebVitalEntry>();
	for (const entry of report.webVitals) {
		latest.set(entry.name, entry);
	}
	return ['CLS', 'FCP', 'INP', 'LCP', 'TTFB']
		.map((name) => latest.get(name))
		.filter((entry): entry is WebVitalEntry => entry !== undefined);
}

export function createSummaryMarkdown(report: CrawlReport): string {
	const lines = [
		'# Crawltest Summary',
		'',
		`- Success: ${report.summary.success ? 'yes' : 'no'}`,
		`- Duration: ${report.summary.duration}`,
		`- Routes discovered: ${report.summary.routesDiscovered}`,
		`- URLs visited: ${report.summary.urlsVisited}`,
		`- Content failures: ${report.summary.contentFailures}`,
		`- Console errors: ${report.summary.consoleErrors}`,
		`- Network errors: ${report.summary.networkErrors}`,
		`- Interaction failures: ${report.summary.failedClicks}`,
		`- Web Vitals captured: ${report.summary.webVitalsCount}`,
		'',
		'## Web Vitals',
		'',
	];

	const vitals = latestVitals(report);
	if (vitals.length === 0) {
		lines.push('No Web Vitals were captured.');
	} else {
		for (const entry of vitals) {
			lines.push(
				`- ${entry.name}: ${formatVitalValue(entry)} (${entry.rating}) at ${entry.url}`
			);
		}
	}

	const failures = [
		...report.errors.map((entry) => `${entry.type}: ${entry.message}`),
		...report.consoleErrors.map((entry) => `console: ${entry.message} at ${entry.url}`),
		...report.networkErrors.map(
			(entry) => `network: ${entry.status} ${entry.statusText} at ${entry.url}`
		),
	];
	lines.push('', '## Failures', '');
	if (failures.length === 0) {
		lines.push('No hard failures.');
	} else {
		for (const failure of failures) {
			lines.push(`- ${failure}`);
		}
	}

	return `${lines.join('\n')}\n`;
}

export async function writeCrawlReport(
	report: CrawlReport,
	rootDir: string
): Promise<WrittenCrawlReport> {
	const logsDir = join(rootDir, 'logs');
	await mkdir(logsDir, { recursive: true });

	const jsonPath = join(logsDir, 'crawltest.json');
	const summaryPath = join(logsDir, 'crawltest-summary.md');
	await writeFile(jsonPath, `${JSON.stringify(report, null, '\t')}\n`, 'utf8');
	await writeFile(summaryPath, createSummaryMarkdown(report), 'utf8');

	return { jsonPath, summaryPath };
}

export function printReport(report: CrawlReport, written: WrittenCrawlReport): void {
	console.log('');
	console.log('[crawltest] Report');
	console.log(`  Duration: ${report.summary.duration}`);
	console.log(`  Routes discovered: ${report.summary.routesDiscovered}`);
	console.log(`  URLs visited: ${report.summary.urlsVisited}`);
	console.log(
		`  Content assertions: ${report.summary.contentAssertions} (${report.summary.contentFailures} failed)`
	);
	console.log(`  Elements clicked: ${report.summary.elementsClicked}`);
	console.log(`  Failed clicks: ${report.summary.failedClicks}`);
	console.log(`  Dialogs tested: ${report.summary.dialogsTested}`);
	console.log(`  Switches tested: ${report.summary.switchesTested}`);
	console.log(`  Selects tested: ${report.summary.selectsTested}`);
	console.log(`  Errors: ${report.summary.totalErrors}`);
	console.log(`  Console errors: ${report.summary.consoleErrors}`);
	console.log(`  Console warnings: ${report.summary.consoleWarnings}`);
	console.log(`  Network errors: ${report.summary.networkErrors}`);
	console.log(`  Web Vitals captured: ${report.summary.webVitalsCount}`);
	console.log(`  Screenshots taken: ${report.summary.screenshotsTaken}`);

	const vitals = latestVitals(report);
	if (vitals.length > 0) {
		console.log('');
		console.log('[crawltest] Latest Web Vitals');
		for (const entry of vitals) {
			console.log(`  ${entry.name}: ${formatVitalValue(entry)} (${entry.rating})`);
		}
	}

	console.log('');
	console.log(`  JSON: ${relative(process.cwd(), written.jsonPath)}`);
	console.log(`  Summary: ${relative(process.cwd(), written.summaryPath)}`);
}
