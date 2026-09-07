import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('what sticks inside main clears the shell bar above it', () => {
	test('the shell publishes its in-flow bar height and withdraws it when out of flow', async () => {
		const shell = stripComments(await read('components', 'layout', 'shellTopBar.ts'));

		// `offsetHeight` of a `sm:fixed inset-y-0` rail is the viewport height, which as an offset
		// would push every sticky heading off the bottom of the screen. The position check is what
		// lets one consumer class be correct at every width.
		expect(shell).toContain("getComputedStyle(node).position !== 'fixed'");
		expect(shell).toContain("inFlow ? `${node.offsetHeight}px` : '0px'");
		// The bar wraps its own controls, so its height is not a constant to be measured once.
		expect(shell).toContain('new ResizeObserver(publish)');
		expect(shell).toContain('observer.disconnect()');
	});

	test('the shell nav is the element being measured', async () => {
		const layout = stripComments(await read('components', 'layout', 'AppLayout.tsx'));

		expect(layout).toContain("from './shellTopBar.ts'");
		expect(layout).toContain('ref={observeShellTopBar}');
		// The measured element has to be the one that is `sticky` in flow and `fixed` from sm up —
		// measuring anything else publishes a height that describes nothing.
		const aside = layout.slice(
			layout.indexOf('<aside'),
			layout.indexOf('ref={observeShellTopBar}'),
		);
		expect(aside).toContain('sticky top-0 z-20');
		expect(aside).toContain('sm:fixed');
	});

	test('the diary day heading sticks below the bar rather than under it', async () => {
		const feed = stripComments(await read('pages', 'diary', 'DiaryFeed.tsx'));

		// It was `top-0 z-10` against a `top-0 z-20` bar: the heading landed entirely inside the
		// bar's footprint at 390x844 and was painted over, which is the opposite of what a sticky
		// heading is for.
		expect(feed).toContain('sticky top-[var(--app-topbar-height,0px)] z-10');
		expect(feed).not.toContain('sticky top-0');
	});

	test('nothing that sticks to the page sticks to a bare top-0', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			// The shell's own bar is the thing being cleared; it cannot clear itself.
			if (path === 'components/layout/AppLayout.tsx') continue;
			const source = stripComments(await Bun.file(join(srcRoot, file)).text());
			// A table header sticks to the top of its own scrollport, not to the viewport, so the
			// shell bar is never above it and no offset applies. That is the only legitimate use
			// of a bare `top-0` inside `main`, and it only occurs in a file that renders a table.
			if (source.includes('<table')) continue;
			for (const match of source.matchAll(/sticky top-0[^'"`]*/g)) {
				offenders.push(`${path}: ${match[0].trim()}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});

describe('generated prose cannot force the page sideways', () => {
	test('markdown wraps long unbroken tokens and scrolls only its code blocks', async () => {
		const markdown = stripComments(await read('components', 'shared', 'MarkdownContent.tsx'));
		const codeBlock = stripComments(
			await read('components', 'shared', 'MarkdownCodeBlock.tsx'),
		);

		// A run id, a Windows path or a URL in a diary entry is one unbroken token; in a `<p>` with
		// no break rule it sets the paragraph's minimum width and takes the whole page with it.
		expect(markdown).toContain('break-words');
		// A code block wraps nothing by definition, so it gets a scrollport of its own instead.
		expect(markdown).toContain('<MarkdownCodeBlock code={block.code}');
		expect(codeBlock).toContain('<OverflowScroller');
		expect(codeBlock).toContain('className="max-w-full min-w-0 rounded-md bg-muted"');
	});

	test('the diary card breaks the fields it renders itself', async () => {
		const card = stripComments(await read('pages', 'diary', 'DiaryEntryCard.tsx'));

		// Title and summary are generated text outside MarkdownContent, so they need their own rule.
		expect(card).toContain('font-semibold break-words text-foreground');
		expect(card).toContain('mt-1 text-sm break-words text-foreground ${proseMeasureClass}');
	});
});
