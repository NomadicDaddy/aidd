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
	test('the two expansions are 44px and cost nothing from sm up', async () => {
		const target = stripComments(await read('lib', 'touchTarget.ts'));

		// A link and a checkbox have no height to raise — the box is the glyph — so the target has
		// to grow around it, with an equal negative margin so the layout does not move.
		expect(target).toContain("touchTargetTextClass = 'inline-block max-sm:-my-3 max-sm:py-3");
		expect(target).toContain('sm:-my-1.5 sm:py-1.5');
		expect(target).toContain("touchTargetBoxClass = 'max-sm:-m-3.5 max-sm:p-3.5'");
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
