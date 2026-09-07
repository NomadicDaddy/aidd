import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'puppeteer';

import { printAnalysis } from '../../scripts/crawltest-analyze.ts';
import type {
	CrawlBuildIdentity,
	CrawlReport,
	WebVitalEntry,
} from '../../scripts/crawltest-types.ts';
import {
	finalizeRouteVitals,
	HIDE_DOCUMENT_SCRIPT,
	RESTORE_DOCUMENT_SCRIPT,
} from '../../scripts/lib/crawltest/vitals-finalize.ts';

/** A document whose visibility comes from its prototype, as a real one's does. */
function fakeDocument(): { dispatched: string[]; document: Record<string, unknown> } {
	const dispatched: string[] = [];
	const prototype = {};
	Object.defineProperty(prototype, 'visibilityState', { get: () => 'visible' });
	Object.defineProperty(prototype, 'hidden', { get: () => false });
	const document = Object.create(prototype) as Record<string, unknown>;
	document.dispatchEvent = (event: { type: string }) => {
		dispatched.push(event.type);
		return true;
	};
	return { dispatched, document };
}

function runScript(script: string, document: unknown): void {
	class FakeEvent {
		type: string;
		constructor(type: string) {
			this.type = type;
		}
	}
	new Function('document', 'Event', `return ${script}`)(document, FakeEvent);
}

function vital(name: string, value: number): WebVitalEntry {
	return {
		name,
		navigationType: 'navigate',
		rating: 'good',
		timestamp: '2026-08-30T00:00:00.000Z',
		url: 'http://127.0.0.1:3210/projects',
		value,
	};
}

const identity: CrawlBuildIdentity = {
	indexHash: 'abc123',
	mode: 'production',
	origin: 'http://127.0.0.1:3210',
	revision: 'deadbeef',
	timestamp: '2026-08-30T00:00:00.000Z',
	version: '3.0.0',
};

function reportWith(webVitals: WebVitalEntry[], build: CrawlBuildIdentity | null): CrawlReport {
	return {
		buildIdentity: build,
		clickedElements: [],
		consoleErrors: [],
		consoleWarnings: [],
		contentAssertions: [],
		errors: [],
		networkErrors: [],
		summary: {
			consoleErrors: 0,
			consoleWarnings: 0,
			contentAssertions: 0,
			contentFailures: 0,
			dialogsTested: 0,
			duration: '1.00s',
			elementsClicked: 0,
			failedClicks: 0,
			networkErrors: 0,
			routesDiscovered: 1,
			screenshotsTaken: 0,
			selectsTested: 0,
			success: true,
			switchesTested: 0,
			totalErrors: 0,
			urlsVisited: 1,
			webVitalsCount: webVitals.length,
		},
		visitedUrls: ['http://127.0.0.1:3210/projects'],
		webVitals,
	};
}

describe('web vitals lifecycle finalization', () => {
	test('hides the document and fires visibilitychange, which is what web-vitals waits for', () => {
		const { dispatched, document } = fakeDocument();
		expect(document.visibilityState).toBe('visible');

		runScript(HIDE_DOCUMENT_SCRIPT, document);
		expect(document.visibilityState).toBe('hidden');
		expect(document.hidden).toBe(true);
		expect(dispatched).toEqual(['visibilitychange']);
	});

	test('restores the real visibility so later assertions see a normal page', () => {
		const { dispatched, document } = fakeDocument();
		runScript(HIDE_DOCUMENT_SCRIPT, document);
		runScript(RESTORE_DOCUMENT_SCRIPT, document);

		expect(document.visibilityState).toBe('visible');
		expect(document.hidden).toBe(false);
		expect(dispatched).toEqual(['visibilitychange', 'visibilitychange']);
	});

	test('drives a non-destructive keypress before the lifecycle event', async () => {
		const calls: string[] = [];
		const page = {
			evaluate: (script: string) => {
				calls.push(script === HIDE_DOCUMENT_SCRIPT ? 'hide' : 'restore');
				return Promise.resolve(true);
			},
			keyboard: {
				press: (key: string) => {
					calls.push(`key:${key}`);
					return Promise.resolve();
				},
			},
		} as unknown as Page;

		await finalizeRouteVitals(page, 0);
		expect(calls).toEqual(['key:Tab', 'hide', 'restore']);
	});

	test('a page that cannot be finalized does not abort the crawl', async () => {
		const page = {
			evaluate: () => Promise.reject(new Error('Target closed')),
			keyboard: { press: () => Promise.resolve() },
		} as unknown as Page;

		expect(await finalizeRouteVitals(page, 0)).toBeUndefined();
	});
});

describe('crawl report analysis verdict', () => {
	let directory: string;

	async function writeReport(report: CrawlReport): Promise<string> {
		directory = await mkdtemp(join(tmpdir(), 'w6-crawl-'));
		const path = join(directory, 'crawltest.json');
		await writeFile(path, JSON.stringify(report), 'utf8');
		return path;
	}

	test('fails a report that covers only some metrics', async () => {
		const path = await writeReport(
			reportWith([vital('LCP', 900), vital('FCP', 300)], identity),
		);
		try {
			const failures = printAnalysis(
				JSON.parse(await Bun.file(path).text()) as CrawlReport,
				path,
				'abc123',
			);
			expect(failures.filter((entry) => entry.startsWith('coverage:'))).toHaveLength(3);
		} finally {
			await removeTempTree(directory);
		}
	});

	test('fails a fully covered report taken against a different build', async () => {
		const report = reportWith(
			['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].map((name) => vital(name, 5)),
			identity,
		);
		const path = await writeReport(report);
		try {
			expect(printAnalysis(report, path, 'a-different-build')).toHaveLength(1);
			expect(printAnalysis(report, path, 'abc123')).toEqual([]);
		} finally {
			await removeTempTree(directory);
		}
	});
});
