import { describe, expect, test } from 'bun:test';
import { evaluateBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';

// A template-mode scaffold: two records the template seeded (already complete, stamped with
// `spernakit_version`) and two the blueprint wrote, the first of which builds on a template record.
const templateShell: Feature = {
	directory: 'shell-audit-logs',
	id: 'shell-audit-logs',
	passes: true,
	priority: 1,
	spernakit_version: '3.43.0',
	status: 'completed',
	title: 'Audit logs (template)',
};
const templateBacklog: Feature = {
	directory: 'shell-open-finding',
	id: 'shell-open-finding',
	passes: false,
	priority: 2,
	spernakit_version: '3.43.0',
	status: 'backlog',
	title: 'Open template finding',
};
const productFirst: Feature = {
	dependencies: ['shell-audit-logs'],
	directory: 'product-hardening',
	id: 'product-hardening',
	passes: false,
	priority: 1,
	status: 'backlog',
	title: 'Hardening',
};
const productLater: Feature = {
	directory: 'product-later',
	id: 'product-later',
	passes: false,
	priority: 2,
	status: 'waiting_approval',
	title: 'Later',
};

const roadmap: Roadmap = {
	features: {
		'product-hardening': { milestone: 'MVP' },
		'product-later': { milestone: 'v1.0' },
		'shell-audit-logs': { milestone: 'MVP' },
		'shell-open-finding': { milestone: 'v1.0' },
	},
	milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
};

describe('blueprint readiness and template-owned records', () => {
	test('ignores template-owned records outside the template repository', () => {
		const readiness = evaluateBlueprintReadiness(
			'coding',
			[templateShell, templateBacklog, productFirst, productLater],
			roadmap,
		);

		expect(readiness.state).toBe('ready');
		expect(readiness.ready).toBe(true);
		expect(readiness.firstFeature?.id).toBe('product-hardening');
	});

	test('still resolves a product dependency on a completed template record', () => {
		const blockedByShell = evaluateBlueprintReadiness(
			'coding',
			[{ ...templateShell, passes: false, status: 'backlog' }, productFirst, productLater],
			roadmap,
		);

		expect(blockedByShell.state).toBe('blocked');
		expect(blockedByShell.reason).toContain('dependency-ready');
	});

	test('counts the same records as product work inside the template repository', () => {
		const readiness = evaluateBlueprintReadiness(
			'coding',
			[templateShell, templateBacklog, productFirst, productLater],
			roadmap,
			{ templateRepo: true },
		);

		expect(readiness.state).toBe('building');
		expect(readiness.ready).toBe(false);
	});

	test('reports a blueprint with only template-owned records as having no product features', () => {
		const readiness = evaluateBlueprintReadiness('coding', [templateShell], roadmap);

		expect(readiness.state).toBe('blocked');
		expect(readiness.reason).toContain('No product features');
	});
});
