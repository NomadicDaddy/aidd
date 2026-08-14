import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function blockedIconClasses(): string {
	const script = [
		"import { buttonClassName } from './src/components/ui/button.tsx';",
		"console.log(buttonClassName('secondary', undefined, 'icon', true));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

describe('disabled control weight', () => {
	test('keeps icon actions transparent without weakening their labels', () => {
		const iconClasses = blockedIconClasses();

		expect(iconClasses).toContain('border-border/60');
		expect(iconClasses).toContain('bg-transparent');
		expect(iconClasses).toContain('text-muted-foreground');
		expect(iconClasses).not.toContain('bg-muted');
	});

	test('suppresses disabled option chrome inside a segmented-control track', async () => {
		const segmentedControl = await readFile(
			resolve(FRONTEND_ROOT, 'src/components/ui/segmented-control.tsx'),
			'utf8',
		);

		expect(segmentedControl).toMatch(
			/option\.disabled\s+&&\s+'border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-transparent'/u,
		);
		expect(segmentedControl).toContain('disabled={option.disabled}');
	});
});
