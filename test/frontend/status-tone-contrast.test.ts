import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const pagesRoot = join(process.cwd(), 'frontend', 'src', 'pages');

// The tone families that carry operational meaning. `600`/`700`/`800` are the light-theme shades:
// on the dark canvas they measure well under WCAG AA, which is what makes an unpaired declaration a
// defect rather than a style preference.
const statusTextClass = /text-(?:amber|emerald|red|teal|violet)-(?:600|700|800)\b/g;

// A theme-safe declaration pairs the light shade with a dark one under the same variant chain, e.g.
// `text-teal-700 dark:text-teal-300` or `group-hover:text-teal-700 dark:group-hover:text-teal-300`.
const pairedDarkVariant = /dark:(?:[\w[\]./-]+:)*text-(?:amber|emerald|red|teal|violet)-/;

// Uses that are deliberately exempt because the class does not sit on a themed surface or does not
// communicate status. Keep this list short and justified — an entry here is a claim that the tone
// helpers in frontend/src/lib/tones.ts would be wrong for the site, not merely inconvenient.
const exemptions: { file: string; why: string }[] = [];

async function pageSources(): Promise<{ path: string; text: string }[]> {
	const glob = new Bun.Glob('**/*.{ts,tsx}');
	const files: { path: string; text: string }[] = [];
	for await (const file of glob.scan({ absolute: false, cwd: pagesRoot, onlyFiles: true })) {
		files.push({
			path: file.replaceAll('\\', '/'),
			text: await Bun.file(join(pagesRoot, file)).text(),
		});
	}
	return files;
}

describe('status tones carry dark variants', () => {
	test('rejects bare status text classes in the page layer', async () => {
		const exempt = new Set(exemptions.map((entry) => entry.file));
		const offenders: string[] = [];

		for (const { path, text } of await pageSources()) {
			if (exempt.has(path)) continue;
			const lines = text.split('\n');
			for (const [index, line] of lines.entries()) {
				statusTextClass.lastIndex = 0;
				if (!statusTextClass.test(line)) continue;
				if (pairedDarkVariant.test(line)) continue;
				offenders.push(`${path}:${index + 1} ${line.trim()}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('routes the audited status sites through the tone helpers', async () => {
		const catalog = await Bun.file(
			join(pagesRoot, 'audits', 'tabs', 'CatalogTable.tsx'),
		).text();
		const card = await Bun.file(join(pagesRoot, 'projects', 'ProjectCard.tsx')).text();

		// The Audits REPORTS column and the Projects failing-count suffix were the two sites the
		// sweep measured below AA on the dark canvas.
		expect(catalog).toContain('className={toneText.emerald}');
		expect(catalog).toContain('className={toneText.amber}');
		expect(catalog).toContain('className={toneText.red}');
		expect(card).toContain('`ml-2 text-xs ${toneText.amber}`');
		expect(card).toContain('`text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}');
		// The port dots and the feature-progress bar read their fill from the same scale.
		expect(card).toContain("toneSolid[listening ? 'emerald' : 'red']");
	});

	test('never leaves status to color alone', async () => {
		const catalog = await Bun.file(
			join(pagesRoot, 'audits', 'tabs', 'CatalogTable.tsx'),
		).text();
		const card = await Bun.file(join(pagesRoot, 'projects', 'ProjectCard.tsx')).text();

		// Each colored count keeps its word, and the orphan glyph keeps its accessible name.
		expect(catalog).toContain('{item.freshReportCount} fresh');
		expect(catalog).toContain('{item.staleReportCount} stale');
		expect(catalog).toContain('{item.missingReportCount} missing');
		expect(card).toContain('aria-label="Missing on disk"');
	});

	test('fixes the foreground of console text that sits on the always-dark scroller', async () => {
		const highlight = await Bun.file(join(pagesRoot, 'runs', 'liveConsoleText.tsx')).text();
		const console_ = await Bun.file(join(pagesRoot, 'runs', 'LiveConsole.tsx')).text();

		// The transcript scroller is bg-[#0a0e14] in both themes, so themed foreground tokens
		// invert against it — `text-foreground` on amber-300 is near-white under the dark theme.
		expect(highlight).toContain('bg-amber-300 text-neutral-900');
		expect(highlight).not.toContain('bg-amber-300 text-foreground');
		expect(console_).toContain('<span className="text-white/60">');
	});
});
