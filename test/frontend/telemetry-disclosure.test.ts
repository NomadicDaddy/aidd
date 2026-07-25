import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	DEFAULT_MAX_FILE_SIZE_BYTES,
	DEFAULT_MAX_ROTATED_FILES,
} from '../../shared/src/lib/aiCallLog.ts';
import { MAX_METRICS_HOURS } from '../../backend/src/services/metricsService.ts';

function renderTransparencyComponents(): string {
	const script = [
		"import { createElement, Fragment } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router-dom';",
		"import { TelemetryDisclosure } from './src/pages/telemetry/TelemetryDisclosure.tsx';",
		"import { TelemetrySummary } from './src/pages/telemetry/TelemetrySummary.tsx';",
		"import { LeaderboardCard } from './src/pages/telemetry/TelemetryComponents.tsx';",
		'const totals = { completed: 1, failed: 1, killed: 1, nested: 4, noWork: 1, running: 1, stopped: 1, topLevel: 8, total: 12, warnings: 6 };',
		'const row = { avgDurationMs: 1000, completed: 1, failed: 1, killed: 1, lastUsedAt: 1700000000000, nested: 4, noWork: 1, resourceId: "demo", resourceName: "Demo", resourceType: "skill", running: 1, stopped: 1, topLevel: 3, total: 7, warnings: 1 };',
		'const content = createElement(Fragment, null, createElement(TelemetryDisclosure), createElement(TelemetrySummary, { totals }), createElement(LeaderboardCard, { rows: [row] }));',
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
		expect(html).toContain('Top-level actions');
		expect(html).toContain('Nested steps');
		expect(html).toContain('No work');
		expect(html).toContain('exactly one outcome');
		expect(html).toContain(
			'1 completed · 1 warnings · 1 failed · 1 stopped · 1 killed · 1 no work · 1 running',
		);
	});

	// The disclosure states retention and rotation limits as plain numbers. Those numbers are a
	// promise about real behavior, so bind the copy to the constants that actually enforce it —
	// otherwise a policy change silently leaves the privacy card asserting something untrue.
	test('quotes retention and rotation limits that match the enforcing constants', () => {
		const html = renderTransparencyComponents();

		expect(MAX_METRICS_HOURS / 24).toBe(30);
		expect(html).toContain('up to 30 days');

		expect(DEFAULT_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toBe(10);
		expect(DEFAULT_MAX_ROTATED_FILES).toBe(5);
		expect(html).toContain('rotate at 10 MB with up to five archived files');
	});
});
