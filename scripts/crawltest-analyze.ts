#!/usr/bin/env bun
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CrawlReport } from './crawltest-types.ts';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TOP_N = 5;
const RATING_SCORE: Record<string, number> = {
	good: 0,
	'needs-improvement': 1,
	poor: 2,
};

interface MetricSnapshot {
	name: string;
	rating: string;
	value: number;
}

interface PageIssue {
	issues: MetricSnapshot[];
	page: string;
	worstScore: number;
}

function isWorse(candidate: MetricSnapshot, existing: MetricSnapshot): boolean {
	const candidateScore = RATING_SCORE[candidate.rating] ?? 0;
	const existingScore = RATING_SCORE[existing.rating] ?? 0;
	if (candidateScore !== existingScore) return candidateScore > existingScore;
	return candidate.value > existing.value;
}

function toPagePath(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		return url;
	}
}

function markerFor(rating: string): string {
	if (rating === 'good') return 'ok';
	if (rating === 'needs-improvement') return 'warn';
	return 'bad';
}

function formatValue(name: string, value: number): string {
	if (name === 'CLS') return value.toFixed(3);
	return `${Math.round(value)}ms`;
}

function printTopSlowest(
	byPage: Map<string, Map<string, MetricSnapshot>>,
	metricName: string
): void {
	const entries: { page: string; rating: string; value: number }[] = [];
	for (const [page, metrics] of byPage) {
		const metric = metrics.get(metricName);
		if (metric) entries.push({ page, rating: metric.rating, value: metric.value });
	}
	if (entries.length === 0) return;

	entries.sort((a, b) => b.value - a.value);
	console.log(`\nSlowest pages by ${metricName}:`);
	for (const entry of entries.slice(0, TOP_N)) {
		console.log(
			`  ${markerFor(entry.rating).padEnd(4)} ${formatValue(metricName, entry.value).padStart(8)} ${entry.page}`
		);
	}
}

export function analyzeCrawlReport(report: CrawlReport): {
	byPage: Map<string, Map<string, MetricSnapshot>>;
	pagesWithIssues: PageIssue[];
} {
	const byPage = new Map<string, Map<string, MetricSnapshot>>();
	for (const entry of report.webVitals) {
		const page = toPagePath(entry.url);
		let metrics = byPage.get(page);
		if (!metrics) {
			metrics = new Map<string, MetricSnapshot>();
			byPage.set(page, metrics);
		}

		const candidate = { name: entry.name, rating: entry.rating, value: entry.value };
		const existing = metrics.get(entry.name);
		if (!existing || isWorse(candidate, existing)) {
			metrics.set(entry.name, candidate);
		}
	}

	const pagesWithIssues: PageIssue[] = [];
	for (const [page, metrics] of byPage) {
		const issues = [...metrics.values()].filter((entry) => entry.rating !== 'good');
		if (issues.length === 0) continue;
		pagesWithIssues.push({
			issues,
			page,
			worstScore: issues.reduce(
				(score, entry) => Math.max(score, RATING_SCORE[entry.rating] ?? 0),
				0
			),
		});
	}

	pagesWithIssues.sort((a, b) => b.worstScore - a.worstScore || a.page.localeCompare(b.page));
	return { byPage, pagesWithIssues };
}

export function printAnalysis(report: CrawlReport, reportPath: string): void {
	const ageMs = Date.now() - statSync(reportPath).mtimeMs;
	const { byPage, pagesWithIssues } = analyzeCrawlReport(report);

	console.log('');
	console.log('Crawltest Web Vitals Analysis');
	console.log(`  Source: ${reportPath}`);
	if (ageMs > STALE_AFTER_MS) {
		const ageHours = Math.round(ageMs / (60 * 60 * 1000));
		console.log(`  Warning: report is ${ageHours}h old; consider re-running crawltest.`);
	}

	if (report.webVitals.length === 0) {
		console.log('');
		console.log('No Web Vitals entries in crawltest.json.');
		return;
	}

	console.log(`  Pages analyzed: ${byPage.size}`);
	console.log(`  Total metric samples: ${report.webVitals.length}`);

	if (pagesWithIssues.length === 0) {
		console.log('');
		console.log('All captured Web Vitals are rated good.');
	} else {
		console.log('');
		console.log(`Pages with non-good ratings: ${pagesWithIssues.length}`);
		for (const pageIssue of pagesWithIssues) {
			console.log(`\n  ${pageIssue.page}`);
			pageIssue.issues.sort(
				(a, b) => (RATING_SCORE[b.rating] ?? 0) - (RATING_SCORE[a.rating] ?? 0)
			);
			for (const metric of pageIssue.issues) {
				console.log(
					`    ${markerFor(metric.rating).padEnd(4)} ${metric.name.padEnd(5)} ${formatValue(metric.name, metric.value)} (${metric.rating})`
				);
			}
		}
	}

	printTopSlowest(byPage, 'LCP');
	printTopSlowest(byPage, 'FCP');
	console.log('');
}

if (import.meta.main) {
	const reportPath = resolve(import.meta.dirname, '..', 'logs', 'crawltest.json');
	if (!existsSync(reportPath)) {
		console.log('No crawltest report found at logs/crawltest.json.');
		console.log('Run `bun run crawltest` first to generate it.');
		process.exit(0);
	}

	const report = JSON.parse(readFileSync(reportPath, 'utf8')) as CrawlReport;
	printAnalysis(report, reportPath);
	process.exit(0);
}
