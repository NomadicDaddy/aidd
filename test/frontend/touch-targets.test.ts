import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

// 44px is `11` on the spacing scale. Anything smaller, applied with no breakpoint prefix, applies on
// the phone viewport too — which is the only place the floor is about.
const FLOOR_STEP = 11;
const undersizedToken = /^(min-)?[hw]-(\d+(?:\.\d+)?)$/;

function isUndersized(token: string): boolean {
	const match = undersizedToken.exec(token);
	if (!match) return false;
	return Number(match[2]) < FLOOR_STEP;
}

/** Every `<Button>` / `<IconButton>` opening tag, with the string classNames it sets. */
function buttonClassNames(source: string): { classNames: string[]; line: number }[] {
	const tags: { classNames: string[]; line: number }[] = [];
	for (const match of source.matchAll(/<(?:Icon)?Button\b/g)) {
		let depth = 0;
		let end = match.index;
		for (let index = match.index; index < source.length; index += 1) {
			const character = source[index];
			if (character === '{') depth += 1;
			else if (character === '}') depth -= 1;
			else if (character === '>' && depth === 0) {
				end = index;
				break;
			}
		}
		const tag = source.slice(match.index, end);
		const classNames = [
			...tag.matchAll(/className=(?:"([^"]*)"|\{[^}]*?'([^']*)'[^}]*?\})/g),
		].map((attribute) => attribute[1] ?? attribute[2] ?? '');
		tags.push({ classNames, line: source.slice(0, match.index).split('\n').length });
	}
	return tags;
}

describe('the shared control scale reaches the touch floor', () => {
	test('every Button size is at least 44px below sm and unchanged from sm up', async () => {
		const button = stripComments(await read('components', 'ui', 'button.tsx'));
		const block = button.slice(
			button.indexOf('const sizes'),
			button.indexOf('};', button.indexOf('const sizes')),
		);

		// Each size names its floor with no prefix, so it applies from 0px, and hands the height
		// back at sm. Before this, the four sizes measured 32, 36, 36 and 40px — not one of them
		// reached 44, so the app had no way to spell a compliant target at all.
		expect(block).toContain("compact: 'min-h-11");
		expect(block).toContain("default: 'min-h-11");
		expect(block).toContain("icon: 'h-11 w-11");
		expect(block).toContain("toolbar: 'min-h-11");
		expect(block).toContain('sm:min-h-8');
		expect(block).toContain('sm:h-9 sm:min-h-0');
		expect(block).toContain('sm:h-9 sm:w-9');
		expect(block).toContain('sm:h-10 sm:min-h-0');
	});

	test('inputs and selects carry the same floor', async () => {
		const styles = stripComments(await read('lib', 'formStyles.ts'));
		const chrome = styles.slice(
			styles.indexOf('const controlChromeClass'),
			styles.indexOf('`;'),
		);

		// One string is every input and every select in the app; at h-9 each one was a 36px target.
		expect(chrome).toContain('min-h-11');
		expect(chrome).toContain('sm:h-9');
		expect(chrome).toContain('sm:min-h-0');
	});

	test('no call site cancels the floor with a height of its own', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			if (path === 'components/ui/button.tsx') continue;
			const source = stripComments(await Bun.file(join(srcRoot, file)).text());
			for (const tag of buttonClassNames(source)) {
				for (const value of tag.classNames) {
					const undersized = value.split(/\s+/).filter(isUndersized);
					// A prefixed token is fine — `sm:h-8` restores the desk size and never applies
					// on a phone. It is the bare one that silently outvotes the scale.
					if (undersized.length > 0)
						offenders.push(`${path}:${tag.line} ${undersized.join(' ')}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test('no wrapper shrinks the buttons inside it below sm', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		// `AppLayout` did exactly this: `max-sm:[&_button]:h-8` on the mobile header row, which no
		// change to the `Button` scale could ever reach, because it is aimed at the phone on purpose.
		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const source = stripComments(await Bun.file(join(srcRoot, file)).text());
			for (const match of source.matchAll(
				/max-sm:\[&_(?:button|a|input)]:(min-)?[hw]-[\d.]+/g,
			)) {
				const line = source.slice(0, match.index).split('\n').length;
				offenders.push(`${file.replaceAll('\\', '/')}:${line} ${match[0]}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});

describe('what the scale cannot reach grows its hit area instead', () => {
	test('the three idioms are 44px and cost nothing from sm up', async () => {
		const target = stripComments(await read('lib', 'touchTarget.ts'));
		// Prettier wraps a long declaration onto its own line, so compare on one.
		const flat = target.replaceAll(/\s+/g, ' ');

		// A link and a checkbox have no height to raise — the box is the glyph — so the target has
		// to grow around it, with an equal negative margin so the layout does not move.
		expect(flat).toContain(
			"touchTargetTextClass = 'inline-block max-sm:-my-3 max-sm:py-3 max-sm:leading-5 sm:-my-1.5 sm:py-1.5'",
		);
		expect(flat).toContain("touchTargetBoxClass = 'inline-flex max-sm:-m-3.5 max-sm:p-3.5'");
		// The third idiom grows the row rather than borrowing from its neighbours, which is the
		// only safe answer inside a stacked list: a 20px row on an 8px gap that expanded by 12px
		// either way would put its hit area on the row above.
		expect(flat).toContain(
			"touchTargetRowClass = 'max-sm:flex max-sm:min-h-11 max-sm:items-center'",
		);
		// Below sm only. Overlapping rows in a dense desk table would be a real cost paid for a
		// pointer that does not need it.
		for (const line of target.split('\n')) {
			if (line.includes('-my-3') || line.includes('-m-3.5'))
				expect(line).toContain('max-sm:');
		}
	});

	test('both execution row links use it, and neither keeps its own expansion', async () => {
		const links = stripComments(await read('pages', 'runs', 'ExecutionRowLinks.tsx'));

		// `ProjectDetailLink` had the right technique at the wrong size (`-my-1.5 py-1.5`, 32px) and
		// `ConsoleSelectionButton` beside it had none at all.
		expect(links).toContain("from '../../lib/touchTarget.ts'");
		expect(links.match(/touchTargetTextClass,/g)).toHaveLength(2);
		expect(links).not.toContain('-my-1.5 inline-block py-1.5');
	});

	test('the box expansion goes only where there is no label to enlarge', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const users: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const source = stripComments(await Bun.file(join(srcRoot, file)).text());
			if (source.includes('touchTargetBoxClass')) users.push(file.replaceAll('\\', '/'));
		}

		// Every other checkbox in the app sits inside a `<label>`, and the label is already the
		// target and already large enough. Applying the expansion globally would pad 16px boxes that
		// were never the target, and would do it inside desk tables too.
		expect(users).toEqual(['pages/audits/tabs/CatalogCards.tsx']);
	});
});

/* ---------------------------------------------------------------------------------------------
   The raw interactive elements.

   The two guards above cover what goes through `Button` and `formStyles`. That left the elements
   authored as plain JSX — `<a>`, `<button>`, `<Link>` — which is where the 390px sweep of
   2026-08-07 found all thirty undersized shapes. This guard closes that gap: every raw interactive
   tag in `frontend/src` must reach the floor by some route the file can be read to establish, or
   be named below with the reason it does not.

   An exemption is an entry in `EXEMPT`, never a pattern. A rule like "skip links inside a `<p>`"
   would have quietly swallowed the twelve genuine misses that sat in list items, and a rule keyed
   on a class name would have gone stale the first time someone restyled the element. Each entry
   names a file, a substring that identifies the tag inside it, and why that tag is exempt. Stale
   entries fail too, so a fixed element cannot leave its excuse behind.
   --------------------------------------------------------------------------------------------- */

const RAW_TAG = /<(a|button|input|Link|NavLink|select|textarea)(?=[\s>])/g;
/** `h-11` is 44px. A `max-sm:` prefix still applies on a phone; any other prefix does not. */
const SIZED = /(?:^|[\s:'"`])(?:max-sm:)?(?:min-)?h-(\d+(?:\.\d+)?)/g;
const FLOOR_IDIOM = /touchTarget(?:Text|Box|Row)Class|buttonClassName/;

interface Exemption {
	/** Path under `frontend/src`, POSIX separators. */
	file: string;
	/** A substring of the opening tag that identifies it within the file. */
	marker: string;
	/** Why this element does not take the floor. */
	reason: string;
}

const EXEMPT: Exemption[] = [
	// (b) Inline links inside running prose. The floor is vertical, and a sentence has no vertical
	// room to give: expanding one word of a paragraph puts its hit area on the lines above and
	// below, which belong to the other words. All of these clear the 24px WCAG 2.5.8 AA minimum.
	{
		file: 'components/shared/MarkdownContent.tsx',
		marker: 'text-accent underline underline-offset-2 hover:text-accent/80',
		reason: 'The `<a>` of the markdown renderer — prose by definition.',
	},
	{
		file: 'pages/projects/detail/ArtifactViewerDialog.tsx',
		marker: 'className={`underline ${toneText.teal}`}',
		reason: 'The `<a>` the artifact viewer hands to `react-markdown` — prose by definition.',
	},
	{
		file: 'pages/projects/detail/RunsTab.tsx',
		marker: 'className="underline"',
		reason: '"Runs page", mid-sentence in the empty state.',
	},
	{
		file: 'pages/projects/ProjectIngestLane.tsx',
		marker: 'result.intakeSessionId',
		reason: '"intake session", mid-sentence in a result line.',
	},
	{
		file: 'pages/projects/SkippedRootsWarning.tsx',
		marker: 'to="/settings"',
		reason: '"Settings", mid-sentence in the warning paragraph.',
	},
	{
		file: 'components/shared/DirectorChatModal.tsx',
		marker: 'to="/director"',
		reason: '"Director page", mid-sentence in the modal body.',
	},

	// (c) The real hit area is a larger ancestor or descendant the tag itself does not spell.
	{
		file: 'pages/diary/DiaryTimelineList.tsx',
		marker: 'after:absolute after:inset-0',
		reason: 'A stretched link: `after:inset-0` makes the whole positioned row the target.',
	},
	{
		file: 'pages/projects/ProjectDetailPage.tsx',
		marker: 'to="/projects"',
		reason: 'A `<Link>` wrapping a `<Button>`, which carries the floor itself.',
	},
	{
		file: 'pages/projects/detail/OverviewSummary.tsx',
		marker: 'block rounded-xl focus-visible:ring-2 focus-visible:ring-accent',
		reason: 'A `<Link>` wrapping a `Metric` tile — the tile is the target.',
	},
	{
		file: 'pages/dashboard/FeatureQueueCard.tsx',
		marker: 'bg-card/75',
		reason: 'A `<Link>` around a two-line card body at `p-3`; the box is well over 44px.',
	},
	{
		file: 'pages/projects/detail/dependencyGraphComponents.tsx',
		marker: 'absolute overflow-hidden rounded-md border border-l-4',
		reason: 'A graph node, absolutely positioned at a size the layout pass computes.',
	},
	{
		file: 'pages/projects/detail/dependencyGraphComponents.tsx',
		marker: 'w-full rounded-md border border-border bg-muted px-3 py-2',
		reason: 'Two stacked lines of text at `py-2` — 52px before any floor is applied.',
	},
	{
		file: 'components/ui/checkbox.tsx',
		marker: 'type="checkbox"',
		reason: 'Chrome drops `padding` on a native checkbox; the wrapping `<label>` takes the floor.',
	},
	{
		file: 'pages/projects/detail/profile/FacetCard.tsx',
		marker: 'type="radio"',
		reason: 'Same as the checkbox — the `<label>` around it carries `max-sm:min-h-11`.',
	},

	// Surfaces that do not render below `sm`, so a phone never sees the element at all.
	{
		file: 'pages/audits/tabs/CatalogTable.tsx',
		marker: 'text-accent tabular-nums hover:underline',
		reason: 'Inside `Card className="hidden p-0 xl:block"`; `CatalogCards` is the phone rendering.',
	},
	{
		file: 'pages/projects/profileMatrix/ProfileMatrixRow.tsx',
		marker: 'block truncate text-sm font-semibold',
		reason: 'Inside `Card className="hidden p-0 xl:block"`; `ProfileMatrixMobileList` stands in.',
	},

	// The bottom-docked terminal. It renders at every width, but its chrome lives in a 28px tab
	// strip whose height is the pane header's, and every control in it is a modifier on an xterm
	// session driven from a hardware keyboard. Raising these to 44px below `sm` would break the
	// strip to serve a surface a phone cannot usefully drive.
	{
		file: 'components/terminal/TerminalFindBar.tsx',
		marker: 'Find in terminal',
		reason: 'Terminal find bar: a 24px input in the 28px pane strip.',
	},
	{
		file: 'components/terminal/TerminalFindBar.tsx',
		marker: 'Previous match',
		reason: 'Terminal find bar.',
	},
	{
		file: 'components/terminal/TerminalFindBar.tsx',
		marker: 'Next match',
		reason: 'Terminal find bar.',
	},
	{
		file: 'components/terminal/TerminalFindBar.tsx',
		marker: 'Close find',
		reason: 'Terminal find bar.',
	},
	{
		file: 'components/terminal/TerminalPaneBody.tsx',
		marker: 'text-teal-600 underline-offset-2',
		reason: 'The terminal "Try again" link in the pane error state.',
	},
	{
		file: 'components/terminal/TerminalPaneHeader.tsx',
		marker: 'max-w-40 truncate',
		reason: 'A terminal tab title in the 28px strip.',
	},
	{
		file: 'components/terminal/TerminalPaneHeader.tsx',
		marker: 'Close terminal tab',
		reason: 'The terminal tab close cross in the 28px strip.',
	},
	{
		file: 'components/terminal/TerminalPaneHeader.tsx',
		marker: 'Shell for new tabs',
		reason: 'The terminal shell picker in the 28px strip.',
	},
	{
		file: 'components/terminal/TerminalTabView.tsx',
		marker: 'border-amber-400/60',
		reason: 'The terminal paste confirmation, sized to the overlay it sits in.',
	},
	{
		file: 'components/terminal/TerminalTabView.tsx',
		marker: 'rounded px-2 py-0.5 hover:bg-amber-100',
		reason: 'The terminal paste confirmation, sized to the overlay it sits in.',
	},

	// Pointer- and keyboard-only affordances.
	{
		file: 'components/layout/AppLayout.tsx',
		marker: 'href="#main-content"',
		reason: 'The skip link: `sr-only` until it takes keyboard focus, and never tapped.',
	},
	{
		file: 'pages/dashboard/SortableDashboardCard.tsx',
		marker: 'cursor-grab',
		reason: 'A drag handle for a grid that is a single column below `xl`.',
	},
	{
		file: 'pages/dashboard/SortableDashboardCard.tsx',
		marker: "cn(pillClassName, 'cursor-pointer')",
		reason: 'The half/full width toggle, which changes nothing at one column.',
	},
	{
		file: 'pages/dashboard/SortableDashboardCard.tsx',
		marker: 'cursor-ns-resize',
		reason: 'A pointer/keyboard resize grip; `handleResizeKeyDown` is the accessible path.',
	},

	// Measured and kept.
	{
		file: 'pages/recipes/RecipeBadgeTooltip.tsx',
		marker: 'className={triggerClass}',
		reason: '198 badges at 24px. `Tooltip` injects the tap handler, but the badge text is already the information and the tooltip only elaborates; the chips sit in a `flex flex-wrap gap-1.5` cluster where a 44px box would overlap its neighbours and steal their taps. Clears WCAG 2.5.8 AA.',
	},
];

/** The opening tag at `start`, brace-aware so a `{...}` prop and an arrow `=>` do not end it. */
function tagAt(source: string, start: number): string {
	let depth = 0;
	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		if (character === '{') depth += 1;
		else if (character === '}') depth -= 1;
		else if (character === '>' && depth === 0 && source[index - 1] !== '=')
			return source.slice(start, index + 1);
	}
	return source.slice(start);
}

function reachesFloor(text: string): boolean {
	if (FLOOR_IDIOM.test(text)) return true;
	for (const match of text.matchAll(SIZED)) if (Number(match[1]) >= FLOOR_STEP) return true;
	return false;
}

/** Comments blanked rather than deleted, so reported line numbers stay true. */
function blankComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//g, (block) => block.replaceAll(/[^\n]/g, ' '))
		.replaceAll(/(^|[^:])\/\/[^\n]*/gm, (all, lead: string) => lead.padEnd(all.length, ' '));
}

const sources = new Map<string, string>();
async function sourceOf(path: string): Promise<string> {
	if (!sources.has(path)) {
		const text = await Bun.file(path)
			.text()
			.catch(() => '');
		sources.set(path, blankComments(text));
	}
	return sources.get(path) as string;
}

/** `const NAME = <value>;` in a module, whether or not it is exported. */
function declaredValue(source: string, name: string): null | string {
	const match = new RegExp(`(?:export )?const ${name}(?::[^=]*)? =([\\s\\S]{0,900}?);\\n`).exec(
		source,
	);
	return match?.[1] ?? null;
}

function resolveSpecifier(fromFile: string, specifier: string): string {
	if (!specifier.startsWith('.')) return '';
	const segments: string[] = [];
	for (const part of `${fromFile.slice(0, fromFile.lastIndexOf('/'))}/${specifier}`.split('/')) {
		if (part === '.') continue;
		if (part === '..') segments.pop();
		else segments.push(part);
	}
	return segments.join('/');
}

/**
 * The imported module and the name it exports for the local identifier `name`, following
 * `import { a as b }` renames.
 */
function importOf(source: string, name: string): null | { exported: string; specifier: string } {
	for (const block of source.matchAll(/import \{([^}]*)\} from '([^']+)'/gs)) {
		const specifier = block[2] ?? '';
		for (const entry of (block[1] ?? '').split(',')) {
			const [exported = '', local] = entry.trim().split(/\s+as\s+/);
			if ((local ?? exported) !== name) continue;
			return { exported, specifier };
		}
	}
	return null;
}

/** Does `text` reach the floor directly, or through the constants it names? */
async function resolvesToFloor(
	file: string,
	source: string,
	text: string,
	depth: number,
): Promise<boolean> {
	if (reachesFloor(text)) return true;
	if (depth === 0) return false;
	const names = new Set(
		[...text.matchAll(/\b([a-z][A-Za-z0-9]*)\b/g)].map((match) => match[1] ?? ''),
	);
	for (const name of names) {
		const local = declaredValue(source, name);
		if (local && (await resolvesToFloor(file, source, local, depth - 1))) return true;
		const imported = importOf(source, name);
		if (!imported) continue;
		const target = resolveSpecifier(file, imported.specifier);
		if (!target) continue;
		const module = await sourceOf(target);
		const value = declaredValue(module, imported.exported);
		if (value && (await resolvesToFloor(target, module, value, depth - 1))) return true;
	}
	return false;
}

describe('raw interactive elements reach the floor or say why not', () => {
	test('every one of them is sized, or enumerated above with a reason', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];
		const used = new Set<Exemption>();
		let examined = 0;

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			const absolute = join(srcRoot, file).replaceAll('\\', '/');
			const source = await sourceOf(absolute);
			for (const match of source.matchAll(RAW_TAG)) {
				examined += 1;
				const tag = tagAt(source, match.index);
				if (await resolvesToFloor(absolute, source, tag, 3)) continue;
				const excuse = EXEMPT.find(
					(entry) => entry.file === path && tag.includes(entry.marker),
				);
				if (excuse) {
					used.add(excuse);
					continue;
				}
				const line = source.slice(0, match.index).split('\n').length;
				offenders.push(`${path}:${line} <${match[1]}`);
			}
		}

		// The sweep that produced this guard measured 185 raw interactive tags. The number is here
		// so that a resolver that silently stops matching tags fails loudly instead of passing.
		expect(examined).toBeGreaterThan(150);
		expect(offenders).toEqual([]);
		expect(EXEMPT.filter((entry) => !used.has(entry)).map((entry) => entry.marker)).toEqual([]);
	});
});
