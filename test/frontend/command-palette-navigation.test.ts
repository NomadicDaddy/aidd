import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(resolve(ROOT, ...path.split('/'))).text();
}

describe('command palette navigation state', () => {
	test('keeps the selected row visible without relying on hover', async () => {
		const command = await read('frontend/src/components/ui/command.tsx');
		const palette = await read('frontend/src/components/shared/CommandPalette.tsx');

		expect(command).toContain('data-[selected=true]:bg-accent-muted');
		expect(command).toContain('data-[selected=true]:text-accent-muted-foreground');
		expect(palette).toContain('group-data-[selected=true]:text-accent-muted-foreground');
		expect(command).not.toMatch(/hover:[^'\s]*ring-accent/);
	});

	test('keeps the current group heading pinned over the scrolling rows', async () => {
		const command = await read('frontend/src/components/ui/command.tsx');

		for (const utility of ['sticky', 'top-0', 'z-10', 'bg-card/95']) {
			expect(command).toContain(`[&_[cmdk-group-heading]]:${utility}`);
		}
		expect(command).not.toContain("'overflow-hidden text-foreground'");
	});

	test('syncs the combobox active descendant to the selected option', async () => {
		const command = await read('frontend/src/components/ui/command.tsx');

		expect(command).toContain('useCommandState((state) => state.value)');
		expect(command).toContain("wrapperRef.current?.querySelector('[cmdk-input]')");
		expect(command).toContain(".closest('[cmdk-root]')");
		expect(command).toContain('\'[aria-selected="true"]\'');
		expect(command).toContain("'aria-activedescendant',");
	});
});
