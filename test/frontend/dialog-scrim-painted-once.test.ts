import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	acquireDialogLayer,
	getDialogStackSnapshot,
	resolveDialogStackLayer,
} from '../../frontend/src/components/ui/dialogStack.ts';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

function renderDialogStack(depth: number): string {
	const result = Bun.spawnSync(
		[
			process.execPath,
			'-e',
			[
				"import { createElement } from 'react';",
				"import { renderToStaticMarkup } from 'react-dom/server';",
				"import { Dialog, DialogPanel } from './src/components/ui/dialog.tsx';",
				'const noop = () => {};',
				'const stack = (remaining) =>',
				"\tcreateElement(Dialog, { onClose: noop, open: true }, createElement(DialogPanel, null, remaining === 1 ? 'top' : stack(remaining - 1)));",
				`console.log(renderToStaticMarkup(stack(${depth})));`,
			].join('\n'),
		],
		{
			cwd: FRONTEND,
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		},
	);
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('nested dialogs paint one scrim', () => {
	test.each([1, 2, 3])('keeps one semantic backdrop across a %i-dialog stack', (depth) => {
		const markup = renderDialogStack(depth);

		expect(markup.match(/bg-\[var\(--overlay\)\]/g)?.length).toBe(1);
		expect(markup.match(/backdrop-blur-sm/g)?.length).toBe(1);
		expect(markup.match(/role="dialog"/g)?.length).toBe(depth);
		expect(markup.match(/data-dialog-depth="\d+"/g)?.length).toBe(depth);
	});

	test('keeps every nested overlay transparent, blur-free, and above its parent', () => {
		const markup = renderDialogStack(3);

		expect(markup.match(/bg-transparent/g)?.length).toBe(2);
		expect(markup.match(/backdrop-blur-none/g)?.length).toBe(2);
		expect(markup).toContain('data-dialog-depth="0"');
		expect(markup).toContain('data-dialog-depth="1"');
		expect(markup).toContain('data-dialog-depth="2"');
		expect(markup).toContain('style="z-index:100"');
		expect(markup).toContain('style="z-index:101"');
		expect(markup).toContain('style="z-index:102"');
	});

	test('keeps one scrim owner while sibling dialogs open and exit together', () => {
		const releaseFirstPresence = acquireDialogLayer('first-sibling', 'present');
		const releaseFirstActive = acquireDialogLayer('first-sibling', 'active');
		const releaseSecondPresence = acquireDialogLayer('second-sibling', 'present');
		const releaseSecondActive = acquireDialogLayer('second-sibling', 'active');

		try {
			expect(resolveDialogStackLayer('first-sibling', getDialogStackSnapshot())).toEqual({
				depth: 0,
				ownsScrim: true,
			});
			expect(resolveDialogStackLayer('second-sibling', getDialogStackSnapshot())).toEqual({
				depth: 1,
				ownsScrim: false,
			});

			releaseFirstActive();
			expect(
				resolveDialogStackLayer('second-sibling', getDialogStackSnapshot()).ownsScrim,
			).toBe(true);

			releaseSecondActive();
			expect(
				resolveDialogStackLayer('first-sibling', getDialogStackSnapshot()).ownsScrim,
			).toBe(true);
			expect(
				resolveDialogStackLayer('second-sibling', getDialogStackSnapshot()).ownsScrim,
			).toBe(false);
		} finally {
			releaseSecondActive();
			releaseFirstActive();
			releaseSecondPresence();
			releaseFirstPresence();
		}

		expect(getDialogStackSnapshot()).toEqual({ activeDialogIds: [], presentDialogIds: [] });
	});
});
