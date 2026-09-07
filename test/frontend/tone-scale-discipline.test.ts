import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');
const paletteDefinitionPaths = new Set(['lib/series.ts', 'lib/tones.ts']);
const paletteUtility =
	/(?:[a-z-]+:)*[a-z-]+-(?:amber|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|neutral|orange|pink|purple|red|rose|sky|slate|stone|teal|violet|yellow|zinc)-\d+(?:\/\d+)?/g;

function paletteLiterals(source: string): string[] {
	return [...source.matchAll(paletteUtility)].map((match) => match[0]);
}

async function scanFrontend(): Promise<Map<string, string[]>> {
	const glob = new Bun.Glob('**/*.{css,ts,tsx}');
	const found = new Map<string, string[]>();

	for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
		const path = file.replaceAll('\\', '/');
		if (paletteDefinitionPaths.has(path)) continue;
		const literals = paletteLiterals(await Bun.file(join(srcRoot, file)).text());
		if (literals.length > 0) found.set(path, literals);
	}

	return found;
}

describe('tone scale discipline', () => {
	test('raw palette utilities exist only in the token and tone definitions', async () => {
		const offenders = [...(await scanFrontend())].flatMap(([path, literals]) =>
			[...new Set(literals)].map((literal) => `${path}: ${literal}`),
		);

		expect(offenders).toEqual([]);
	});

	test('the tone layer declares the interaction and graphic shapes its consumers need', async () => {
		const tones = await Bun.file(join(srcRoot, 'lib/tones.ts')).text();
		for (const record of [
			'toneStroke',
			'toneSurfaceFocus',
			'toneSurfaceHover',
			'toneTextHover',
			'toneTextHoverStrong',
		]) {
			expect(tones).toContain(`export const ${record}: Record<Tone, string>`);
		}
	});

	test('documents the assertion every semantic tone makes', async () => {
		const [badge, metric, tones] = await Promise.all([
			Bun.file(join(srcRoot, 'components/ui/badge.tsx')).text(),
			Bun.file(join(srcRoot, 'components/shared/Metric.tsx')).text(),
			Bun.file(join(srcRoot, 'lib/tones.ts')).text(),
		]);

		for (const assertion of [
			'`neutral` = no status assertion',
			'`teal` = active or informational state',
			'`violet` = system-managed state',
			'`emerald` = healthy or successful state',
			'`amber` = actionable attention backed by an explicit state or named band/threshold',
			'`red` = failure or error state',
			'A raw non-zero count never establishes the band required for `amber`',
		]) {
			expect(tones).toContain(assertion);
		}
		expect(badge).toContain('identity and taxonomy stay neutral');
		expect(metric).toContain('the fact that a count is non-zero is not such a band');
	});

	test('the card header link composes its colour from the scale', async () => {
		const card = await Bun.file(join(srcRoot, 'components/ui/card.tsx')).text();
		const link = card.slice(card.indexOf('export const cardHeaderLinkClass'));
		expect(link).toContain('toneText.teal');
		expect(link).toContain('toneTextHoverStrong.teal');
		expect(paletteLiterals(link)).toEqual([]);
	});
});
