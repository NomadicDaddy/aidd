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

	test('the four migrated strips render through Metric', async () => {
		const dashboard = await read('pages', 'dashboard', 'FeatureSummaryCard.tsx');
		expect(dashboard).toContain('<Metric label="Pending" size="compact" tone="amber"');
		expect(dashboard).not.toContain('<SummaryTile');

		const session = await read('pages', 'pipelineSessions', 'SessionSummaryCard.tsx');
		expect(session).toContain('<Metric');
		expect(session).not.toContain('<SummaryTile');

		const overview = await read('pages', 'projects', 'detail', 'OverviewSummary.tsx');
		expect(overview).toContain('<Metric');
		expect(overview).not.toContain('<SummaryTile');

		// About stated the app's own version in a face the app uses for nothing else.
		const about = await read('pages', 'about', 'AboutPage.tsx');
		expect(about).toContain(
			'<Metric key={label} label={label} size="compact" value={value} />',
		);
		expect(about).not.toContain('font-mono text-xs');
	});

	test('tone is a reading, so a zero is never an alarm', async () => {
		const source = await read('components', 'shared', 'Metric.tsx');
		// `REQUIRED MISSING 0` rendered red and `COMPLETED 0` rendered emerald: the same
		// reading was an alarm on one tab and a success on the next, and neither was true.
		expect(source).toContain('function readingTone(tone: Tone, value: ReactNode): Tone {');
		expect(source).toContain("return value === 0 || value === '0' ? 'neutral' : tone;");
		expect(source).toContain('const reading = readingTone(tone, value);');
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
		expect(telemetry).toContain('marker={seriesDot(');
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
			join('pages', 'dashboard', 'DashboardPage.tsx'),
		]) {
			const source = await read(file);
			expect(source).not.toContain('font-display');
			expect(source).toContain('<Metric');
		}
	});
});
