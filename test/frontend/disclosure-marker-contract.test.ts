import { describe, expect, test } from 'bun:test';
import { join, posix, resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');
const CONTROLLED_DISCLOSURE_EXEMPTIONS = new Map([
	[
		'components/shared/ColumnChooser.tsx',
		'column chooser opens a selection popover and uses the Columns icon as its idiom',
	],
	[
		'components/shared/FilterToolbar.tsx',
		'filters open a modal dialog and use the Filters icon as their idiom',
	],
	[
		'components/shared/LaunchTargetControl.tsx',
		'launch target opens a dialog and uses its execution-identity summary as the idiom',
	],
	[
		'components/shared/run-detail/runDetailParts.tsx',
		'long command expansion is an inline underlined Show more or Show less text idiom',
	],
	[
		'components/ui/dropdown-menu.tsx',
		'menu triggers expose aria-haspopup=menu rather than disclosing inline content',
	],
	[
		'pages/recipes/RecipeLaunchButton.tsx',
		'launch is an action that opens a form and keeps the Send action icon',
	],
]);

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

async function sourcesContaining(fragment: string): Promise<{ path: string; source: string }[]> {
	const sources: { path: string; source: string }[] = [];
	for await (const path of new Bun.Glob('**/*.tsx').scan({
		cwd: FRONTEND_SOURCE,
		onlyFiles: true,
	})) {
		const source = stripComments(await Bun.file(join(FRONTEND_SOURCE, path)).text());
		if (source.includes(fragment)) sources.push({ path: path.replaceAll('\\', '/'), source });
	}
	return sources;
}

describe('disclosures share one marker contract', () => {
	test('every details summary suppresses the browser marker and leads with DisclosureMarker', async () => {
		const sources = await sourcesContaining('<details');
		expect(sources.length).toBeGreaterThan(0);

		for (const { path, source } of sources) {
			const details = source.match(/<details\b[^>]*>/g) ?? [];
			const summaries = source.match(/<summary\b[\s\S]*?<\/summary>/g) ?? [];

			expect(summaries.length).toBe(details.length);
			// Resolve the import rather than matching its spelling: a file inside components/shared
			// reaches the marker as './DisclosureMarker.tsx' or '../DisclosureMarker.tsx'.
			const markerImport = source.match(/from '(\.[^']*DisclosureMarker\.tsx)'/)?.[1] ?? '';
			expect(
				`${path}: ${posix.normalize(posix.join(posix.dirname(path), markerImport))}`,
			).toBe(`${path}: components/shared/DisclosureMarker.tsx`);
			for (const detailsTag of details) expect(detailsTag).toContain('group');
			for (const summary of summaries) {
				expect(`${path}: ${summary}`).toContain('list-none');
				expect(`${path}: ${summary}`).toContain('marker:content-none');
				expect(`${path}: ${summary}`).toContain('<DisclosureMarker />');
			}
		}
	});

	test('controlled disclosures use DisclosureMarker without local chevrons', async () => {
		const sources = await sourcesContaining('aria-expanded');
		const controlledPaths = new Set(sources.map(({ path }) => path));
		expect(sources.length).toBeGreaterThan(0);

		for (const [path, reason] of CONTROLLED_DISCLOSURE_EXEMPTIONS) {
			expect(`${path}: ${reason}`).not.toEndWith(': ');
			expect(controlledPaths.has(path)).toBeTrue();
		}

		for (const { path, source } of sources) {
			expect(`${path}\n${source}`).not.toMatch(/\bChevron(?:Down|Right|Up)\b/u);
			if (CONTROLLED_DISCLOSURE_EXEMPTIONS.has(path)) continue;

			const triggerCount = source.match(/\baria-expanded=/gu)?.length ?? 0;
			const markerCount = source.match(/<DisclosureMarker\b/gu)?.length ?? 0;
			expect(`${path}: ${triggerCount}`).not.toBe(`${path}: 0`);
			expect(`${path}: DisclosureMarker.tsx import\n${source}`).toContain(
				'DisclosureMarker.tsx',
			);
			expect(markerCount).toBeGreaterThanOrEqual(triggerCount);
		}
	});

	test('the shared marker owns size, theme inheritance, motion and both open-state paths', async () => {
		const source = await Bun.file(
			join(FRONTEND_SOURCE, 'components', 'shared', 'DisclosureMarker.tsx'),
		).text();

		expect(source).toContain("from 'lucide-react/dist/esm/icons/chevron-right'");
		expect(source).toContain('h-3.5 w-3.5 shrink-0 text-current');
		expect(source).toContain('transition-transform duration-150 motion-reduce:transition-none');
		expect(source).toContain(
			"open === undefined ? 'group-open:rotate-90' : open && 'rotate-90'",
		);
		expect(source).toContain('aria-hidden="true"');
	});

	test('the JSON tree toggle says whether it is open and which group it opens', async () => {
		const source = await Bun.file(
			join(FRONTEND_SOURCE, 'components', 'shared', 'JsonTree.tsx'),
		).text();

		// The chevron was the only open/shut signal, and it is decorative to a screen reader.
		expect(source).toContain('aria-expanded={expanded}');
		expect(source).toContain('<DisclosureMarker open={expanded} />');
		// The group exists only while open, so the reference is dropped rather than left dangling.
		expect(source).toContain('const groupId = useId();');
		expect(source).toContain('aria-controls={expanded ? groupId : undefined}');
		expect(source).toContain('<div id={groupId}>');
	});
});
