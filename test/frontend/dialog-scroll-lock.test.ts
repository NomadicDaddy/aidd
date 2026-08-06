import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(path: string): Promise<string> {
	return Bun.file(join(srcRoot, ...path.split('/'))).text();
}

async function sources(): Promise<string[]> {
	const glob = new Bun.Glob('**/*.tsx');
	const files: string[] = [];
	for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
		files.push(file.replaceAll('\\', '/'));
	}
	return files.sort();
}

const PRIMITIVE = 'components/ui/dialog.tsx';

/**
 * `lockScroll` defaulted to `false`, so locking was something sixteen call sites each had to
 * remember. Three did. Among the thirteen that did not was `components/ui/alert-dialog.tsx` — itself
 * a shared wrapper — so every alert in the application inherited the miss rather than each alert
 * being an independent oversight.
 *
 * On a phone the consequence is not cosmetic: when the dialog does not fill the viewport, the finger
 * that meant to scroll the dialog scrolls the page behind it, and a modal that lets the page move
 * under it reads as a modal that did not take the interaction.
 */
describe('a modal locks the page behind it', () => {
	test('the primitive locks by default, so the exceptions are what carry an argument', async () => {
		const source = await read(PRIMITIVE);

		expect(source).toContain('lockScroll = true,');
		expect(source).toContain("document.body.style.overflow = 'hidden';");
	});

	test('no call site restates the default, and no call site opts out silently', async () => {
		// A prop that repeats the default is noise that makes the default look optional; an opt-out
		// is a claim that this one surface needs the page to move, and the claim belongs at the call
		// site in words. Neither exists today — this is the guard against the next one arriving
		// without either.
		const offenders: string[] = [];
		for (const file of await sources()) {
			if (file === PRIMITIVE) continue;
			const source = await read(file);
			for (const match of source.matchAll(/lockScroll(=\{false\})?/g)) {
				if (match[1]) {
					const line = source.slice(0, match.index).lastIndexOf('\n');
					const preceding = source.slice(Math.max(0, line - 200), line);
					if (preceding.includes('//') || preceding.includes('*/')) continue;
					offenders.push(`${file}: lockScroll={false} with no stated reason`);
					continue;
				}
				offenders.push(`${file}: restates the locked default`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the alert wrapper inherits the default rather than setting its own', async () => {
		const source = await read('components/ui/alert-dialog.tsx');

		// This is the file that made one missed default into an application-wide one. It builds on
		// the primitive and passes no scroll behaviour of its own, so every alert in the app locks
		// because the primitive does — which is the only arrangement where a new alert cannot forget.
		expect(source).toContain("from './dialog.tsx'");
		expect(source).toContain('<Dialog');
		expect(source).not.toContain('lockScroll');
	});

	test('the drawer is a dialog, so it locks for the same reason', async () => {
		// HelpDrawer looks like a separate kind of surface and was worth checking by hand: it is
		// styled as an edge drawer but rendered through the shared primitive, so it inherits the lock
		// rather than needing one of its own.
		const source = await read('components/shared/HelpDrawer.tsx');

		expect(source).toContain("from '../ui/dialog.tsx'");
		expect(source).toContain('<Dialog');
		expect(source).not.toContain('lockScroll');
	});

	test('locking reserves the scrollbar gutter instead of reflowing the page', async () => {
		const source = await read(PRIMITIVE);

		// The stated reason locking was opt-in was that it "preserves scrollbar layout" — true, and
		// the fix for it is to reserve the width the scrollbar gave up, not to leave the page
		// scrollable under a modal. Measured from the viewport, so it is 0 wherever scrollbars
		// overlay, which is every phone and the defect's own viewport.
		expect(source).toContain('window.innerWidth - document.documentElement.clientWidth');
		expect(source).toContain('document.body.style.paddingRight = `${gutter}px`');
	});

	test('closing restores what the dialog found, not what it assumes', async () => {
		const source = await read(PRIMITIVE);
		const cleanup = source.slice(source.indexOf('return () => {'));

		// A dialog opened from inside another one finds `hidden` and has to leave it that way, so
		// both properties are captured before the lock and written back from the capture. Restoring
		// to the empty string would unlock the page while the outer dialog is still open.
		expect(cleanup).toContain('document.body.style.overflow = previousOverflow;');
		expect(cleanup).toContain('document.body.style.paddingRight = previousPaddingRight ?? ');
	});
});
