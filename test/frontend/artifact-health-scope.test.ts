import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

interface RenderedArtifactHealth {
	complete: string;
	missing: string;
	partial: string;
	skippedRequired: string;
	stale: string;
}

function renderArtifactHealthStates(): RenderedArtifactHealth {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactsTab } from './src/pages/projects/detail/ArtifactsTab.tsx';

function render(summary, artifactHealth, skip = []) {
	const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
	const artifacts = Array.from({ length: summary.total }, (_, index) => {
		const freshness = index < summary.fresh
			? 'fresh'
			: index < summary.fresh + summary.stale
				? 'stale'
				: 'missing';
		const missingIndex = index - summary.fresh - summary.stale;
		return {
			ageDays: freshness === 'stale' ? 31 : freshness === 'fresh' ? 1 : null,
			exists: freshness !== 'missing',
			freshness,
			label: 'artifact-' + index,
			mtime: freshness === 'missing' ? null : '2026-08-23T00:00:00Z',
			path: '.aidd/artifact-' + index,
			severity:
				freshness === 'missing' && missingIndex < summary.requiredMissing
					? 'required'
					: 'recommended',
			sizeBytes: freshness === 'missing' ? 0 : 100,
		};
	});
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ArtifactsTab, {
				artifactCheck: {
					artifacts,
					checkedAt: '2026-08-24T00:00:00Z',
					staleThresholdDays: 30,
					summary: { ...summary, present: summary.fresh + summary.stale },
				},
				artifactHealth,
				maturity: skip.length > 0 ? { skip, stages: [] } : null,
				projectId: 'fixture',
			}),
		),
	);
}

console.log(JSON.stringify({
	complete: render({ fresh: 12, missing: 0, requiredMissing: 0, stale: 0, total: 12 }, 'fresh'),
	missing: render({ fresh: 0, missing: 12, requiredMissing: 2, stale: 0, total: 12 }, 'missing'),
	partial: render({ fresh: 9, missing: 3, requiredMissing: 1, stale: 0, total: 12 }, 'missing'),
	skippedRequired: render(
		{ fresh: 9, missing: 3, requiredMissing: 1, stale: 0, total: 12 },
		'missing',
		['artifact-9'],
	),
	stale: render({ fresh: 6, missing: 2, requiredMissing: 0, stale: 4, total: 12 }, 'stale'),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedArtifactHealth;
}

describe('artifact health scope', () => {
	const rendered = renderArtifactHealthStates();

	test('names the assertion catalog beside the health heading', () => {
		for (const markup of Object.values(rendered)) {
			expect(markup).toContain('Artifact health');
			expect(markup).toContain('12 checked assertions');
			expect(markup).toContain('Artifact inventory (12)');
		}
	});

	test('renders reconciled numerators and denominators for every health state', () => {
		expect(rendered.complete).toContain('12 of 12 checked assertions');
		expect(rendered.partial).toContain('9 of 12 checked assertions');
		expect(rendered.partial).toContain('3 of 12 checked assertions');
		expect(rendered.partial).toContain('1 of 12 checked assertions');
		expect(rendered.stale).toContain('4 of 12 checked assertions');
		expect(rendered.missing).toContain('2 of 12 checked assertions');
	});

	test('counts a skipped required record as not applicable instead of missing', () => {
		expect(rendered.skippedRequired).toContain('12 checked assertions · 1 not applicable');
		expect(rendered.skippedRequired).toContain('2 of 11 applicable assertions');
		expect(rendered.skippedRequired).toContain('0 of 11 applicable assertions');
		expect(rendered.skippedRequired).toContain('>fresh</span>');
		expect(rendered.skippedRequired).toContain('>Not applicable</span>');
	});

	test('uses explicit artifact summary captions', () => {
		for (const markup of Object.values(rendered)) {
			expect(markup).not.toContain('Needs refresh');
			expect(markup).not.toContain('Not found');
			expect(markup).not.toContain('Blocking');
		}
		expect(rendered.complete).toContain('>Healthy</span>');
	});
});
