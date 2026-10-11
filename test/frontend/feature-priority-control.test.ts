import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderPriorityControl(priority: number): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturePriorityControl } from './src/pages/projects/detail/FeatureRowControls.tsx';

const feature = { id: 'rank-me', milestone: 'Later', priority: ${priority}, status: 'backlog' };

console.log(renderToStaticMarkup(createElement(FeaturePriorityControl, {
	disabled: false,
	deemphasized: false,
	feature,
	onChange: () => undefined,
	priority: feature.priority,
})));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('feature priority control', () => {
	test("renders the feature's own priority as an accessible inline selector", () => {
		const markup = renderPriorityControl(2);

		expect(markup).toContain('aria-label="Priority for rank-me"');
		expect(markup).toContain('<option value="1">P1</option>');
		expect(markup).toContain('<option value="2" selected="">P2</option>');
		// The options are priorities, not milestones: choosing one must not move the feature.
		expect(markup).not.toContain('Later');
	});

	test('keeps a recorded priority outside the offered range selectable', () => {
		const markup = renderPriorityControl(7);

		expect(markup).toContain('<option value="5">P5</option>');
		expect(markup).toContain('<option value="7" selected="">P7</option>');
	});
});
