import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return Bun.file(join(frontendSource, ...relativePath.split('/'))).text();
}

describe('launch-target control size scale', () => {
	test('binds non-chip trigger sizes to the shared button scale', async () => {
		const [button, control] = await Promise.all([
			read('components/ui/button.tsx'),
			read('components/shared/LaunchTargetControl.tsx'),
		]);

		expect(button).toContain(
			"export type ButtonSize = 'compact' | 'default' | 'icon' | 'toolbar'",
		);
		expect(control).toContain(
			"type LaunchTargetControlSize = 'chip' | Exclude<ButtonSize, 'icon'>",
		);
		expect(control).toContain("buttonClassName('secondary', 'max-w-full flex-wrap', size)");
		expect(control).toContain("size === 'chip'");
		expect(control).not.toContain(
			"buttonClassName('secondary', 'max-w-full flex-wrap text-xs', size)",
		);
		expect(button).toContain(
			"compact: 'min-h-11 gap-1.5 px-2.5 text-xs max-sm:min-w-11 sm:min-h-8'",
		);
		expect(button).toContain(
			"default: 'min-h-11 gap-2 px-3 text-sm max-sm:min-w-11 sm:h-9 sm:min-h-0'",
		);
		expect(button).toContain(
			"toolbar: 'min-h-11 gap-2 px-3 text-sm max-sm:min-w-11 sm:h-10 sm:min-h-0'",
		);
	});

	test('sets operational launch surfaces to the default control step', async () => {
		const surfaces = await Promise.all(
			[
				'components/shared/DirectiveTargetField.tsx',
				'components/shared/LaunchForm.tsx',
				'pages/audits/tabs/CatalogToolbar.tsx',
				'pages/projects/ProjectCreateActions.tsx',
				'pages/projects/detail/ReintakeCard.tsx',
				'pages/recipes/RecipeLaunchForm.tsx',
				'pages/runs/RunLaunchCard.tsx',
				'pages/scheduled/ScheduledSafetyFields.tsx',
			].map(read),
		);

		for (const surface of surfaces) {
			expect(surface).toContain('size="default"');
		}
	});
});
