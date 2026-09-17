import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderPriorityControl(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturePriorityControl } from './src/pages/projects/detail/FeatureRowControls.tsx';

const feature = { id: 'move-me', milestone: 'Later', priority: 2, status: 'backlog' };
const roadmap = {
	currentMilestone: 'Soon',
	invalidMappings: [],
	milestoneOrder: ['Soon', 'Later'],
	milestones: {
		Later: { completed: 0, total: 1 },
		Soon: { completed: 0, total: 2 },
	},
	unmappedFeatureDirectories: [],
};

console.log(renderToStaticMarkup(createElement(FeaturePriorityControl, {
	disabled: false,
	deemphasized: false,
	feature,
	onChange: () => undefined,
	priority: feature.priority,
	roadmap,
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
	test('renders the roadmap priorities as an accessible inline selector', () => {
		const markup = renderPriorityControl();

		expect(markup).toContain('aria-label="Priority for move-me"');
		expect(markup).toContain('<option value="Soon">P1 — Soon</option>');
		expect(markup).toContain('<option value="Later" selected="">P2 — Later</option>');
	});
});
