import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderSourceControl(featureName: 'audit' | 'feature' | 'remediation'): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeatureSourceControl } from './src/pages/projects/detail/FeatureRowControls.tsx';

const inventory = [
	{ category: 'Core', id: 'feature-core', passes: false, status: 'backlog' },
	{ category: 'UI', id: 'feature-ui', passes: false, status: 'backlog' },
];
const features = {
	audit: { auditSource: 'SECURITY', category: 'Core', id: 'audit-security-1-finding', passes: false, status: 'backlog' },
	feature: inventory[0],
	remediation: { category: 'UI', id: 'remediation-fix-source', passes: false, status: 'backlog' },
};

console.log(renderToStaticMarkup(createElement(FeatureSourceControl, {
	disabled: false,
	feature: features['${featureName}'],
	inventory: [...inventory, features.audit, features.remediation],
	onChange: () => undefined,
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

describe('feature source control', () => {
	test('renders category-backed sources as an accessible inline selector', () => {
		const markup = renderSourceControl('feature');

		expect(markup).toContain('aria-label="Source for feature-core"');
		expect(markup).toContain('<option value="">Feature backlog</option>');
		expect(markup).toContain('<option value="Core" selected="">Feature: Core</option>');
		expect(markup).toContain('<option value="UI">Feature: UI</option>');
	});

	test('explains why audit and remediation sources are read-only', () => {
		const audit = renderSourceControl('audit');
		const remediation = renderSourceControl('remediation');

		expect(audit).toContain('Audit: SECURITY');
		expect(audit).toContain('Audit provenance');
		expect(audit).not.toContain('<select');
		expect(remediation).toContain('Remediation identity');
		expect(remediation).not.toContain('<select');
	});
});
