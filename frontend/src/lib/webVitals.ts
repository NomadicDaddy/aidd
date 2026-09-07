import type { Metric } from 'web-vitals';

import { currentAuthToken } from '../stores/authTokenStore.ts';
import { publishBuildIdentity } from './buildIdentity.ts';

interface VitalMetric {
	name: string;
	navigationType: string;
	rating: string;
	value: number;
}

/** A buffered measurement, carrying the route it describes rather than the route it flushes on. */
interface BufferedMetric extends VitalMetric {
	url: string;
}

/**
 * Vitals that describe the document load, and so belong to the route the document loaded on. The
 * rest (INP, CLS) accrue while the operator works and belong to wherever they are when it reports.
 */
const LOAD_METRICS = new Set(['FCP', 'LCP', 'TTFB']);

export function shouldLogToConsole(isDevelopment?: boolean): boolean {
	if (isDevelopment ?? import.meta.env.DEV) return true;
	try {
		return window.localStorage.getItem('aidd:crawltest') === '1';
	} catch {
		return false;
	}
}

let buffer: BufferedMetric[] = [];
let flushTimer: null | ReturnType<typeof setTimeout> = null;
/** The route the document loaded on, which is what a load metric measures. */
let loadPathname: null | string = null;

/** How long to batch metrics before POSTing, so a page load's vitals ship as one request. */
const FLUSH_INTERVAL_MS = 10_000;

/** Collapse dynamic path segments so reported URLs aggregate instead of fragmenting per id. */
function sanitizePathname(pathname: string): string {
	return pathname
		.replace(/\/\d+/g, '/:id')
		.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
		.replace(/\/[A-Za-z0-9_-]{20,}/g, '/:token');
}

/**
 * The route a measurement describes.
 *
 * LCP reports on the operator's first interaction, which on an idle panel can be half a minute
 * after the page finished painting — long enough to have flushed the rest of the load's metrics and
 * navigated somewhere else. Reading the pathname once at flush time filed those late reports
 * against whatever route happened to be on screen: `/scheduled` collected five "poor" LCPs it never
 * earned, all of them from loads whose FCP was under half a second.
 */
export function metricPathname(name: string, load: null | string, current: string): string {
	return LOAD_METRICS.has(name) ? (load ?? current) : current;
}

/** One POST per route, so a flush spanning a navigation does not file both under the last one. */
export function batchesByUrl(metrics: BufferedMetric[]): { metrics: VitalMetric[]; url: string }[] {
	const byUrl = new Map<string, VitalMetric[]>();
	for (const { url, ...metric } of metrics) {
		const existing = byUrl.get(url);
		if (existing) existing.push(metric);
		else byUrl.set(url, [metric]);
	}
	return [...byUrl].map(([url, entries]) => ({ metrics: entries, url }));
}

function flushBuffer(): void {
	if (buffer.length === 0) return;
	const batches = batchesByUrl(buffer);
	buffer = [];

	const token = currentAuthToken();
	for (const { metrics, url } of batches) {
		// Fire-and-forget with keepalive so the batch still flushes during pagehide/unload. Raw
		// fetch (not the api client) keeps this off the data-movement trace and avoids the client's
		// 401 token-prompt side effect — a background telemetry POST must never interrupt the user.
		void fetch('/api/v1/system/web-vitals', {
			body: JSON.stringify({ metrics, timestamp: new Date().toISOString(), url }),
			headers: {
				'content-type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			keepalive: true,
			method: 'POST',
		}).catch(() => {
			// Silently ignore reporting failures — telemetry is best-effort.
		});
	}
}

function onMetric(metric: Metric): void {
	const rounded = Math.round(metric.value * 1000) / 1000;
	const entry: VitalMetric = {
		name: metric.name,
		navigationType: metric.navigationType ?? 'unknown',
		rating: metric.rating,
		value: rounded,
	};

	if (shouldLogToConsole()) {
		console.debug(`[Web Vitals] ${JSON.stringify(entry)}`);
		return;
	}

	buffer.push({
		...entry,
		url: metricPathname(entry.name, loadPathname, sanitizePathname(window.location.pathname)),
	});
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL_MS);
}

// Browser-spec long tasks are >50ms by definition; anything materially above that is a main-thread
// stall the user feels as jank. Logging them closes the "no frontend long-task logging" gap — the
// counterpart to backend request/query timing — so a janky interaction leaves a trace instead of
// being invisible. PerformanceObserver(longtask) is Chromium-only; the try/catch makes the call a
// no-op where the entry type is unsupported rather than throwing on init.
function initLongTaskLogging(): void {
	if (typeof PerformanceObserver === 'undefined') return;
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const duration = Math.round(entry.duration * 100) / 100;
				if (shouldLogToConsole()) {
					console.warn(
						`[Long Task] ${JSON.stringify({
							duration,
							name: entry.name,
							startTime: Math.round(entry.startTime * 100) / 100,
						})}`,
					);
				}
			}
		});
		observer.observe({ buffered: true, type: 'longtask' });
	} catch {
		// Long-task observation unsupported in this browser — skip silently.
	}
}

interface LayoutShiftEntry extends PerformanceEntry {
	hadRecentInput: boolean;
	sources?: { node?: Node | null }[];
	value: number;
}

/**
 * Enough of an element to find it in the source: `div#history.grid.min-w-0`.
 *
 * Duck-typed rather than `instanceof Element`, which throws where there is no DOM and misses nodes
 * from another document.
 */
export function describeShiftSource(node: unknown): string {
	if (typeof node !== 'object' || node === null) return 'unknown';
	const { className, id, tagName } = node as Record<string, unknown>;
	if (typeof tagName !== 'string') return 'unknown';
	const idPart = typeof id === 'string' && id ? `#${id}` : '';
	// SVG elements carry an SVGAnimatedString here, not a string; they get the tag name alone.
	const classPart =
		typeof className === 'string' && className.trim()
			? `.${className.trim().split(/\s+/).slice(0, 3).join('.')}`
			: '';
	return `${tagName.toLowerCase()}${idPart}${classPart}`;
}

// CLS is a page-lifetime sum, so a poor score names nothing: the panel's worst sample said only
// that 0.294 of something had moved, on a page whose layout comments already argue at length about
// which regions must not shift. Log each shift with the element that moved, so the next one is
// diagnosed rather than guessed at. Shifts within 500ms of an input are excluded from CLS itself
// and are excluded here too, for the same reason — the user asked for them.
function initLayoutShiftLogging(): void {
	if (typeof PerformanceObserver === 'undefined') return;
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as LayoutShiftEntry[]) {
				// Below a hundredth the shift is imperceptible and the log is noise.
				if (entry.hadRecentInput || entry.value < 0.01) continue;
				if (!shouldLogToConsole()) continue;
				console.warn(
					`[Layout Shift] ${JSON.stringify({
						sources: (entry.sources ?? []).map((source) =>
							describeShiftSource(source.node),
						),
						startTime: Math.round(entry.startTime),
						value: Math.round(entry.value * 1000) / 1000,
					})}`,
				);
			}
		});
		observer.observe({ buffered: true, type: 'layout-shift' });
	} catch {
		// Layout-shift observation unsupported in this browser — skip silently.
	}
}

export function initWebVitals(): void {
	// A measurement is only evidence if you can say which build produced it, so the collector
	// publishes the bundle's identity alongside the samples it is about to emit.
	publishBuildIdentity();

	// Read before the router has had a chance to move: this is the route the document loaded on.
	loadPathname = sanitizePathname(window.location.pathname);

	void import('web-vitals').then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
		const cumulativeOptions = import.meta.env.DEV ? { reportAllChanges: true } : undefined;

		onCLS(onMetric, cumulativeOptions);
		onINP(onMetric, cumulativeOptions);
		onFCP(onMetric);
		onLCP(onMetric);
		onTTFB(onMetric);
	});

	// Flush any buffered metrics before the page is torn down.
	window.addEventListener('pagehide', flushBuffer);

	initLongTaskLogging();
	initLayoutShiftLogging();
}
