import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');
const scalePath = 'lib/tones.ts';

/**
 * Every Tailwind teal/cyan utility in a source file, comments excluded.
 *
 * Comments are stripped because three files explain a colour decision in prose — why a complete
 * milestone stopped being `text-teal-300`, what the xterm palette is derived from — and a guard
 * that reads those as declarations forces the next author to either delete the explanation or
 * exempt the file. Neither is the outcome this test wants.
 */
function toneLiterals(source: string): string[] {
	const code = source
		.replaceAll(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((line) => {
			const trimmed = line.trimStart();
			return !trimmed.startsWith('//') && !trimmed.startsWith('*');
		})
		.join('\n');
	return [...code.matchAll(/(?:[a-z-]+:)*[a-z-]+-(?:teal|cyan)-\d+(?:\/\d+)?/g)].map(
		(match) => match[0],
	);
}

async function scanFrontend(): Promise<Map<string, string[]>> {
	const glob = new Bun.Glob('**/*.{ts,tsx}');
	const found = new Map<string, string[]>();

	for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
		const path = file.replaceAll('\\', '/');
		const literals = toneLiterals(await Bun.file(join(srcRoot, file)).text());
		if (literals.length > 0) found.set(path, literals);
	}

	return found;
}

/**
 * Teal is the app's accent, so it appears in two places the tone scale does not own: the identity
 * of a specific component, and a palette whose entries are data rather than status. Both are
 * legitimate; what is not legitimate is a fourth kind — a component that re-types a pair the scale
 * already declares, and then does not follow when the scale changes.
 *
 * Class B — the colour IS the component. Changing `toneText.teal` should not move it.
 */
const brandIdentity: { file: string; why: string }[] = [
	{ file: 'components/ui/button.tsx', why: 'the primary button fill — the accent itself' },
	{ file: 'components/ui/dropdown-menu.tsx', why: 'accent focus ring, shared with the terminal' },
	{
		file: 'components/terminal/TerminalFindBar.tsx',
		why: 'terminal chrome palette: 400-weight accent on a dark surface',
	},
	{ file: 'components/terminal/TerminalPane.tsx', why: 'terminal chrome palette' },
	{
		file: 'components/terminal/TerminalPaneBody.tsx',
		why: 'terminal 600/400 accent, one step brighter than the scale by design',
	},
	{ file: 'components/terminal/TerminalPaneHeader.tsx', why: 'terminal tab chip palette' },
	{
		file: 'pages/pipelineSessions/StepRunConsole.tsx',
		why: 'bg-teal-400 running pulse; toneSolid.teal is bg-teal-500 and reads dull animated',
	},
	{
		file: 'pages/projects/detail/BlueprintImplementationCard.tsx',
		why: 'blueprint-ready card surface: 50/60 and 950/20 tints, no scale equivalent',
	},
	{
		file: 'pages/projects/ProjectAdvisorRecommendation.tsx',
		why: 'advisor callout border, 300/800 rather than toneBorder.teal',
	},
	{ file: 'pages/projects/ProjectIntakePanel.tsx', why: 'intake panel surface tint' },
	{ file: 'pages/recipes/RecipeBadgeTooltip.tsx', why: 'accent focus ring' },
	{ file: 'pages/runs/RunDetailPanel.tsx', why: 'accent focus ring' },
	{ file: 'pages/runs/RunFileChangeChip.tsx', why: 'accent focus ring' },
	{ file: 'pages/settings/ProviderConfigSection.tsx', why: 'accent focus ring' },
];

/** Class C — a palette entry identifying a series or a graph edge. Not a status. */
const dataPalette: { file: string; why: string }[] = [
	{ file: 'lib/series.ts', why: 'chart series colours; cyan and teal are two distinct series' },
	{
		file: 'pages/projects/ProjectsTableCells.tsx',
		why: 'cyan column accent; the scale has no cyan tone and should not grow one for a table',
	},
	{
		file: 'pages/projects/detail/dependencyGraphComponents.tsx',
		why: 'border-l-teal-500 edge marker in the dependency graph',
	},
];

/**
 * Files that legitimately repeat a token the scale declares. Kept separate from the classification
 * above and deliberately short: each entry is a value that WOULD follow a scale change and does
 * not, so it wants a reason strong enough to survive being read again.
 */
const duplicateExemptions: { file: string; why: string }[] = [
	{
		file: 'components/terminal/TerminalPaneHeader.tsx',
		why: "the active tab chip borrows toneBadge.teal's bg-teal-50/dark:bg-teal-950/40 surface but not its text or ring — it prints neutral text under a teal-400/60 border, so it is the terminal palette rather than a badge",
	},
];

describe('tone scale discipline', () => {
	test('every teal or cyan literal outside the scale is classified', async () => {
		// The guard that was missing. Seven call sites spelled `text-teal-700 dark:text-teal-300`
		// out by hand — `toneText.teal` character for character — and the scale could have been
		// changed without any of them following. An eighth matched only its light half, which is
		// worse: it looked decided. A new file now has to say which kind it is.
		const classified = new Set([
			scalePath,
			...brandIdentity.map((entry) => entry.file),
			...dataPalette.map((entry) => entry.file),
		]);
		const unclassified = [...(await scanFrontend()).keys()].filter(
			(path) => !classified.has(path),
		);

		expect(unclassified).toEqual([]);
	});

	test('no classification entry names a file that has stopped using tone literals', async () => {
		// A stale exemption is how a list like this rots into permission to ignore the rule.
		const scanned = await scanFrontend();
		const stale = [...brandIdentity, ...dataPalette, ...duplicateExemptions]
			.map((entry) => entry.file)
			.filter((file) => !scanned.has(file));

		expect(stale).toEqual([]);
	});

	test('no file outside the scale repeats a value the scale already declares', async () => {
		// Class A: not "uses teal" but "uses the exact token tones.ts uses". `bg-teal-50/60` is a
		// different tint from `bg-teal-50` and passes; `text-teal-700` does not.
		const scale = new Set(toneLiterals(await Bun.file(join(srcRoot, 'lib/tones.ts')).text()));
		const exempt = new Set(duplicateExemptions.map((entry) => entry.file));
		const offenders: string[] = [];

		for (const [path, literals] of await scanFrontend()) {
			if (path === scalePath || exempt.has(path)) continue;
			for (const literal of new Set(literals)) {
				if (scale.has(literal)) offenders.push(`${path}: ${literal} duplicates tones.ts`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('the scale declares the hover shapes its consumers need', async () => {
		// Both were added by remediation-20260806-teal-literals-outside-tones. Without them the two
		// migrated call sites had nothing to import and would have kept their literals.
		const tones = await Bun.file(join(srcRoot, 'lib/tones.ts')).text();
		for (const record of ['toneTextHover', 'toneTextHoverStrong']) {
			expect(tones).toContain(`export const ${record}: Record<Tone, string>`);
		}
	});

	test('the card header link composes its colour from the scale', async () => {
		// This one link is on eight Dashboard and detail cards, which is exactly why its colour has
		// to come from the scale rather than from a string typed once and copied.
		const card = await Bun.file(join(srcRoot, 'components/ui/card.tsx')).text();
		const link = card.slice(card.indexOf('export const cardHeaderLinkClass'));
		expect(link).toContain('toneText.teal');
		expect(link).toContain('toneTextHoverStrong.teal');
		expect(toneLiterals(link)).toEqual([]);
	});
});
