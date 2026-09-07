import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	outputSeriesPattern,
	outputSeriesSolid,
	outputSeriesSolidHover,
	sourceSolid,
} from '../../frontend/src/lib/series.ts';
import { toneSolid } from '../../frontend/src/lib/tones.ts';

const srcRoot = resolve(import.meta.dir, '../../frontend/src');

function read(path: string): Promise<string> {
	return Bun.file(resolve(srcRoot, path)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('canonical category colour', () => {
	test('keeps dependency-source colour in the shared series home', async () => {
		expect(sourceSolid).toEqual({
			audit: toneSolid.amber,
			feature: 'bg-muted-foreground/60',
			remediation: toneSolid.red,
		});

		const graph = stripComments(
			await read('pages/projects/detail/dependencyGraphComponents.tsx'),
		);
		expect(graph).toContain("import { sourceSolid } from '../../../lib/series.ts'");
		expect(graph).toContain('sourceSolid[source]');
		expect(graph).toContain('sourceSolid[node.source]');
		expect(graph).toContain('toneSolid.amber');
		expect(graph).not.toMatch(/bg-(?:amber|red|violet)-\d+/);
	});

	test('keeps agent output series on semantic tokens with non-colour identity cues', () => {
		expect(outputSeriesSolid).toEqual({
			counterpart: 'bg-muted-foreground/60',
			produced: 'bg-accent/80',
		});
		expect(outputSeriesSolidHover).toEqual({
			counterpart: 'group-hover:bg-muted-foreground/75',
			produced: 'group-hover:bg-accent',
		});
		for (const value of [
			...Object.values(outputSeriesSolid),
			...Object.values(outputSeriesSolidHover),
			...Object.values(outputSeriesPattern),
		]) {
			expect(value).not.toMatch(/(?:cyan|fuchsia|indigo|lime)-\d+/);
		}
		expect(outputSeriesPattern.counterpart).not.toBe(outputSeriesPattern.produced);
	});

	test('reserves the accent fill for selection instead of static emphasis or syntax', async () => {
		const disclosure = stripComments(await read('pages/telemetry/TelemetryDisclosure.tsx'));
		const viewer = stripComments(await read('pages/projects/detail/CodeFileViewer.tsx'));

		expect(disclosure).not.toContain('bg-accent-muted');
		expect(viewer).toContain('toneText.emerald');
		expect(viewer).not.toContain('text-accent');
	});

	test('routes informational and warning surfaces through the tone scale', async () => {
		const intake = stripComments(await read('pages/projects/ProjectIntakePanel.tsx'));
		const viewer = stripComments(await read('pages/projects/detail/CodeFileViewer.tsx'));

		expect(intake).toContain('toneBorder.teal');
		expect(intake).toContain('toneSurface.teal');
		expect(intake).not.toMatch(/(?:bg|border)-teal-\d+/);
		for (const helper of ['toneBorder.amber', 'toneSurface.amber', 'toneText.amber']) {
			expect(viewer).toContain(helper);
		}
		expect(viewer).not.toMatch(/(?:bg|border|text)-amber-\d+/);
	});

	test('uses quiet shared chrome only where selects repeat at table scale', async () => {
		const audits = await read('pages/projects/detail/AuditsDesktopTable.tsx');
		const features = await read('pages/projects/detail/FeaturesDesktopTable.tsx');
		const matrix = await read('pages/projects/profileMatrix/ProfileMatrixRow.tsx');
		const styles = await read('lib/formStyles.ts');

		expect(styles).toContain('export const quietSelectClass');
		expect(styles).toContain('group-hover/quiet:border-control-border');
		expect(styles).toContain('focus-visible:ring-ring/80');
		expect(audits).toContain('className={quietSelectClass}');
		expect(audits).toContain('className={`group/quiet border-b');
		expect(features).toContain('className="group group/quiet border-b');
		expect(matrix).toContain('`${quietSelectClass} h-8 w-full px-2 text-xs`');
		expect(matrix).toContain('className={`group group/quiet border-b');
	});
});
