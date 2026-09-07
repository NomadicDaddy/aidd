import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	BACKEND_LOG_ARCHIVE_MAX_AGE_MS,
	BACKEND_LOG_MAX_ARCHIVES,
	BACKEND_LOG_MAX_BYTES,
	EXECUTION_HISTORY_MAX_AGE_MS,
	TRANSCRIPT_MAX_AGE_MS,
	TRANSCRIPT_MAX_BYTES,
} from '../../shared/src/retention.ts';
import { MAX_METRICS_HOURS } from '../../backend/src/services/metricsService.ts';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

function renderTransparencyComponents(): string {
	const script = [
		"import { createElement, Fragment } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { TelemetryDisclosure } from './src/pages/telemetry/TelemetryDisclosure.tsx';",
		"import { TelemetrySummary } from './src/pages/telemetry/TelemetrySummary.tsx';",
		"import { LeaderboardCard } from './src/pages/telemetry/LeaderboardCard.tsx';",
		"import { BackendBreakdownCard } from './src/pages/telemetry/TelemetryComponents.tsx';",
		'const totals = { completed: 1, failed: 1, killed: 1, nested: 3, noWork: 1, running: 1, stopped: 1, topLevel: 21, total: 24, warnings: 6 };',
		'const row = { avgDurationMs: 1000, completed: 1, failed: 1, killed: 1, lastUsedAt: 1700000000000, nested: 4, noWork: 1, resourceId: "demo", resourceName: "Demo", resourceType: "skill", running: 1, stopped: 1, topLevel: 3, total: 7, warnings: 1 };',
		'const pluralRow = { ...row, nested: 5, resourceId: "plural", resourceName: "Plural", total: 8, warnings: 2 };',
		'const content = createElement(Fragment, null, createElement(TelemetryDisclosure), createElement(TelemetrySummary, { totals, windowLabel: "All" }), createElement(LeaderboardCard, { rows: [row, pluralRow] }), createElement(BackendBreakdownCard, { rows: [{ backend: "codex", count: 2 }, { backend: "native", count: 1 }] }));',
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, content)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Telemetry transparency surfaces', () => {
	test('discloses local collection and distinct outcome semantics', () => {
		const html = renderTransparencyComponents();

		expect(html).toContain('What aidd records');
		expect(html).toContain('All telemetry stays in this local aidd installation');
		expect(html).toContain('does not send usage data');
		expect(html).toContain('System and browser health');
		expect(html).toContain('AI call diagnostics');
		expect(html).toContain('Prompt and response contents are not recorded');
		expect(html).toContain('source, CLI and model');
		expect(html).toContain('execution CLI reports them');
		expect(html).toContain('Top-level actions');
		expect(html).toContain('Nested steps');
		expect(html).toContain('88% of invocations');
		expect(html).toContain('12% of invocations');
		expect(html).not.toContain('13% of invocations');
		expect(html).toContain('No work');
		expect(html).toContain('exactly one outcome');
		expect(html).toContain(
			'1 completed · 1 warning · 1 failed · 1 stopped · 1 killed · 1 no work · 1 running',
		);
		expect(html).toContain('2 warnings');
	});

	test('keeps each backend count and proportion bar on one reading measure', () => {
		const html = renderTransparencyComponents();

		expect(html).toContain(
			'<li class="max-w-[46ch]"><div class="flex items-baseline justify-between gap-3 text-xs">',
		);
		expect(html).toContain('class="text-foreground">Codex</span>');
		expect(html).toContain('class="text-foreground">Native</span>');
		expect(html).not.toContain('flex max-w-[46ch] items-baseline');
	});

	// The disclosure states retention and rotation limits as plain numbers. Those numbers are a
	// promise about real behavior, so bind the copy to the constants that actually enforce it —
	// otherwise a policy change silently leaves the privacy card asserting something untrue.
	test('quotes retention and rotation limits that match the enforcing constants', () => {
		const html = renderTransparencyComponents();

		expect(MAX_METRICS_HOURS / 24).toBe(30);
		expect(html).toContain('up to 30 days');

		expect(TRANSCRIPT_MAX_AGE_MS / DAY_MS).toBe(90);
		expect(TRANSCRIPT_MAX_BYTES / GIB).toBe(1);
		expect(EXECUTION_HISTORY_MAX_AGE_MS / DAY_MS).toBe(365);
		expect(BACKEND_LOG_MAX_BYTES / MIB).toBe(10);
		expect(BACKEND_LOG_MAX_ARCHIVES).toBe(5);
		expect(BACKEND_LOG_ARCHIVE_MAX_AGE_MS / DAY_MS).toBe(30);
		expect(html).toContain('retained for up to 90 days');
		expect(html).toContain('within a 1 GiB cap');
		expect(html).toContain('history is retained for 365 days');
		expect(html).toContain('rotate at 10 MiB with up to 5 archives for 30 days');
		expect(html).toContain('same size and archive-count bounds');
	});
});
