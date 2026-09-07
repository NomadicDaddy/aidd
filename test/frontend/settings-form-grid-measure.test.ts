import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { formGridClass, formGridMeasureClass } from '../../frontend/src/lib/formStyles.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function renderFormGrid(): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FormGrid } from './src/components/ui/field.tsx';",
		"console.log(renderToStaticMarkup(createElement(FormGrid, { className: 'gap-4', 'data-testid': 'form-grid' })));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

async function settingsSources(): Promise<string> {
	const sources: string[] = [];
	for await (const relativePath of new Bun.Glob('src/pages/settings/*.tsx').scan({
		cwd: frontendRoot,
	})) {
		sources.push(await Bun.file(resolve(frontendRoot, relativePath)).text());
	}
	sources.push(
		await Bun.file(
			resolve(frontendRoot, 'src/pages/director/DirectorProfileSection.tsx'),
		).text(),
	);
	return sources.join('\n');
}

describe('settings form-grid measure', () => {
	test('makes the measure part of the shared form-grid layer', () => {
		expect(formGridMeasureClass).toBe('max-w-[80rem]');
		expect(formGridClass).toContain(formGridMeasureClass);

		const markup = renderFormGrid();
		expect(markup).toContain('class="grid max-w-[80rem] gap-4"');
		expect(markup).toContain('data-testid="form-grid"');
	});

	test('keeps Settings sections on the shared layer instead of opting into a cap', async () => {
		const sources = await settingsSources();

		expect(sources).not.toContain('formGridMeasureClass');
		expect(sources).not.toContain(
			'grid gap-3 @min-[45rem]:grid-cols-2 @min-[61rem]:grid-cols-3',
		);
		expect(sources.match(/<FormGrid\b/gu)?.length).toBeGreaterThanOrEqual(12);
	});
});
