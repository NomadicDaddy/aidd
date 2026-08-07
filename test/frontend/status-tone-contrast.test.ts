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
		// The REPORTS cell moved out of `CatalogTable.tsx` into `catalogCells.tsx`, which the table
		// and the below-`xl` card stack now share.
		const catalog = await Bun.file(
			join(pagesRoot, 'audits', 'tabs', 'catalogCells.tsx'),
		).text();
		const card = await Bun.file(join(pagesRoot, 'projects', 'ProjectCard.tsx')).text();
		// The card's attribute grid — and with it the port dots — moved into its own file when
		// ProjectCard crossed the 300-line cap.
		const metrics = await Bun.file(
			join(pagesRoot, 'projects', 'ProjectCardMetrics.tsx'),
		).text();

		// The Audits REPORTS column and the Projects failing-count suffix were the two sites the
		// sweep measured below AA on the dark canvas.
		expect(catalog).toContain('className={toneText.emerald}');
		expect(catalog).toContain('className={toneText.amber}');
		expect(catalog).toContain('className={toneText.red}');
		expect(card).toContain('`ml-2 text-xs ${toneText.amber}`');
		expect(card).toContain('`text-xs ${toneText.red}`}>{metadata.sync.lastSyncError}');
		// The port dots and the feature-progress bar read their fill from the same scale.
		expect(metrics).toContain("toneSolid[listening ? 'emerald' : 'red']");
	});

	test('never leaves status to color alone', async () => {
		const cells = await Bun.file(join(pagesRoot, 'audits', 'tabs', 'catalogCells.tsx')).text();
		const utils = await Bun.file(join(pagesRoot, 'audits', 'auditsUtils.ts')).text();
		const card = await Bun.file(join(pagesRoot, 'projects', 'ProjectCard.tsx')).text();

		// The three counts used to carry their own word — "12 fresh · 3 stale · 0 missing", 42 rows
		// deep, which is what stopped the numbers forming a column. The words moved to the column
		// header, so what disambiguates the three tones is now position within a fixed triple that
		// the header names in the same order. That is still not colour, so the assertion is that the
		// header names them and that the cell renders them in that order.
		expect(utils).toContain("reportsColumnLabel = 'Reports (fresh / stale / missing)'");
		const order = ['freshReportCount', 'staleReportCount', 'missingReportCount'].map((field) =>
			cells.indexOf(field),
		);
		expect(order.every((index) => index > -1)).toBe(true);
		expect([...order].sort((left, right) => left - right)).toEqual(order);
		expect(card).toContain('aria-label="Missing on disk"');
	});

	test('keeps console text on the themed scroller surface', async () => {
		const highlight = await Bun.file(join(pagesRoot, 'runs', 'liveConsoleText.tsx')).text();
		const console_ = await Bun.file(join(pagesRoot, 'runs', 'LiveConsole.tsx')).text();
		const pretty = await Bun.file(join(pagesRoot, 'runs', 'LiveConsolePretty.tsx')).text();

		// The find highlight fills with amber-300 in both themes, so its foreground is pinned dark
		// rather than themed — `text-foreground` on amber-300 is near-white under the dark theme.
		// Read off the tag rather than the file: the mark also carries a weight and a rule now (see
		// runs-pipelines-polish), those sort between the fill and the foreground, and the comment
		// above the tag names the class this asserts the absence of.
		const markAt = highlight.indexOf('<mark');
		const markClass = highlight.slice(markAt, highlight.indexOf('>', markAt));

		expect(markClass).toContain('bg-amber-300');
		expect(markClass).toContain('text-neutral-900');
		expect(markClass).not.toContain('text-foreground');

		// The scroller itself is a token surface, one step below the panel around it. It used to be
		// a raw hex with hard-coded white text, which could not follow the light theme at all — so
		// nothing rendered inside it may reach for a fixed white foreground either.
		expect(console_).toContain('border-border bg-background');
		expect(console_).not.toContain('#0a0e14');
		expect(console_).not.toContain('text-white/');
		expect(pretty).not.toContain('text-white/');
	});
});
