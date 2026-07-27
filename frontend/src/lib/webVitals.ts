import type { Metric } from 'web-vitals';

import { currentAuthToken } from '../stores/authTokenStore.ts';

interface VitalMetric {
	name: string;
	navigationType: string;
	rating: string;
	value: number;
}

export function shouldLogToConsole(isDevelopment?: boolean): boolean {
	if (isDevelopment ?? import.meta.env.DEV) return true;
	try {
		return window.localStorage.getItem('aidd:crawltest') === '1';
	} catch {
		return false;
	}
}

let buffer: VitalMetric[] = [];
let flushTimer: null | ReturnType<typeof setTimeout> = null;

/** How long to batch metrics before POSTing, so a page load's vitals ship as one request. */
const FLUSH_INTERVAL_MS = 10_000;

/** Collapse dynamic path segments so reported URLs aggregate instead of fragmenting per id. */
function sanitizePathname(pathname: string): string {
	return pathname
		.replace(/\/\d+/g, '/:id')
		.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
		.replace(/\/[A-Za-z0-9_-]{20,}/g, '/:token');
}

function flushBuffer(): void {
	if (buffer.length === 0) return;
	const batch = {
		metrics: [...buffer],
		timestamp: new Date().toISOString(),
		url: sanitizePathname(window.location.pathname),
	};
	buffer = [];

	const token = currentAuthToken();
	// Fire-and-forget with keepalive so the batch still flushes during pagehide/unload. Raw fetch
	// (not the api client) keeps this off the data-movement trace and avoids the client's 401
	// token-prompt side effect — a background telemetry POST must never interrupt the user.
	void fetch('/api/v1/system/web-vitals', {
		body: JSON.stringify(batch),
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

	buffer.push(entry);
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

export function initWebVitals(): void {
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
}
