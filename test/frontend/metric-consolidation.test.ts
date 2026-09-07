import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

/** Comments naming the deleted components are the record of why they went; they are not the code. */
function stripComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('one labelled-figure tile', () => {
	test('Metric has a compact step that drops the icon slot', async () => {
		const source = await read('components', 'shared', 'Metric.tsx');
		// Two steps and only two: a strip of three headline figures and a strip of eight
		// breakdown figures are different jobs, and every further step invites a sixth copy.
		expect(source).toContain("compact: 'text-lg'");
		expect(source).toContain("default: 'text-2xl'");
		expect(source).toContain('size?: keyof typeof valueSizes');
		// At the compact value size the icon box is taller than the number beside it.
		expect(source).toContain('{icon && !compact && (');
	});

	test('no page declares its own copy of the tile', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			const code = stripComments(await Bun.file(join(srcRoot, file)).text());
			if (/function (?:SummaryTile|CountCard|StatTile|StatCard)\b/.test(code)) {
				offenders.push(path);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('the remaining strips render through Metric', async () => {
		const dashboard = await read('pages', 'dashboard', 'FeatureSummaryCard.tsx');
		// Feature Summary states fleet totals once in its pinned table footer, so it no longer
		// repeats those values as a Metric strip above the same rows.
		expect(dashboard).not.toContain('<Metric');
		expect(dashboard).not.toContain('<SummaryTile');

		const session = await read('pages', 'pipelineSessions', 'SessionSummaryCard.tsx');
		expect(session).toContain('<Metric');
		expect(session).not.toContain('<SummaryTile');

		const overview = await read('pages', 'projects', 'detail', 'OverviewSummary.tsx');
		expect(overview).toContain('<Metric');
		expect(overview).not.toContain('<SummaryTile');

		// About states build identity as labelled facts, not as a headline figure.
		const about = await read('pages', 'about', 'AboutPage.tsx');
		expect(about).not.toContain('<Metric');
		expect(about).toContain('__AIDD_BUILD_REVISION__');
		expect(about).toContain('__AIDD_BUILD_TIMESTAMP__');
		expect(about).toContain('__AIDD_VERSION__');
	});

	test('tone is a reading, so a zero is never an alarm', async () => {
		const source = await read('components', 'shared', 'Metric.tsx');
		// `REQUIRED MISSING 0` rendered red and `COMPLETED 0` rendered emerald: the same
		// reading was an alarm on one tab and a success on the next, and neither was true.
		expect(source).toContain('function readingTone(tone: Tone, value: ReactNode): Tone {');
		expect(source).toContain("if (value === 0) return 'neutral';");
		expect(source).toContain('/^[+-]?0(?:\\.0+)?%?$/u.test(value.trim())');
		// A tone asserts something about a reading, and the error state has no reading: left
		// alone, a tile red on a bad figure kept that red on the failure that replaced it.
		expect(source).toContain("const reading = error ? 'neutral' : readingTone(tone, value);");
		// Both render-time consumers of a tone read the derived one. `valueToneClass` still
		// takes a raw `Tone` — it is the lookup, not the decision — so the property that
		// matters is that nothing downstream of the derivation sees the prop again.
		const body = source.slice(source.indexOf("const compact = size === 'compact';"));
		expect(body).toContain('valueToneClass(reading)');
		expect(body).toContain('toneText[reading]');
		expect(body).not.toMatch(/valueToneClass\(tone\)|toneText\[tone\]/);
	});

	test('a categorical colour cannot be smuggled in as a tone', async () => {
		const telemetry = await read('pages', 'telemetry', 'TelemetrySummary.tsx');
		// The outcome ramp is shared with the chart bars and the legend below, where
		// "emerald means healthy" would be a claim nobody made — so it goes through `marker`.
		// `seriesDot` became `outcomeDot` when the three shape-of-work tiles gave theirs up: the
		// helper only ever hands out colours the legend below names, and it is named for that now.
		expect(telemetry).toContain('marker={outcomeDot(');
		expect(telemetry).not.toMatch(/tone=/);
		expect(telemetry).not.toContain('function CountCard');
	});

	test('Telemetry and Dashboard headline figures share one face and step', async () => {
		const metric = await read('components', 'shared', 'Metric.tsx');
		expect(metric).toContain('font-display font-semibold tabular-nums');

		// Neither page restates the treatment; both take the default step by omitting `size`,
		// which is the only reason the two strips can no longer drift apart.
		for (const file of [
			join('pages', 'telemetry', 'TelemetrySummary.tsx'),
			join('pages', 'dashboard', 'DashboardMetrics.tsx'),
		]) {
			const source = await read(file);
			expect(source).not.toContain('font-display');
			expect(source).toContain('<Metric');
		}
	});
});
