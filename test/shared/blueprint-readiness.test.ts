import { describe, expect, test } from 'bun:test';
import { evaluateBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import type { BlueprintSetupContext } from 'aidd-shared/metadata/blueprint-setup';
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

// The reported defect: `evaluateBlueprintReadiness` returned `preparing` with "Blueprint generation
// is still in progress" for every phase other than coding, so an idle project claimed live work.
// The phase says what is on disk; only the injected setup context says what is executing.
describe('pre-coding readiness separates missing setup from live activity', () => {
	const missingArtifacts = ['.aidd/spec.md', '.aidd/CHANGELOG.md'];

	function preCoding(setup?: BlueprintSetupContext) {
		return evaluateBlueprintReadiness('onboarding', [], undefined, setup ? { setup } : {});
	}

	test('an idle project with missing artifacts reports incomplete setup, not progress', () => {
		const readiness = preCoding({ activity: null, missingArtifacts });

		expect(readiness.state).toBe('setup_incomplete');
		expect(readiness.ready).toBe(false);
		expect(readiness.reason).toBe(
			'Project setup is incomplete: .aidd/spec.md and .aidd/CHANGELOG.md are missing.',
		);
		expect(readiness.reason).not.toContain('in progress');
		expect(readiness.reason).not.toContain('Preparing');
	});

	test('a caller with no view of execution state gets the idle reading, never preparing', () => {
		for (const readiness of [
			preCoding(),
			preCoding({ activity: null, missingArtifacts: [] }),
		]) {
			expect(readiness.state).toBe('setup_incomplete');
			expect(readiness.reason).not.toContain('in progress');
		}
		expect(evaluateBlueprintReadiness('initializer', [], undefined).state).toBe(
			'setup_incomplete',
		);
	});

	test('only running work earns in-progress wording', () => {
		const readiness = preCoding({
			activity: {
				kind: 'run',
				label: 'The coding run',
				lifecycle: 'running',
				reference: 'run_1',
			},
			missingArtifacts,
		});

		expect(readiness.state).toBe('preparing');
		expect(readiness.reason).toBe('The coding run is in progress.');
	});

	test('queued work is described as queued rather than running', () => {
		const readiness = preCoding({
			activity: {
				kind: 'pipeline',
				label: 'The Project intake pipeline',
				lifecycle: 'queued',
				reference: 'pipe_1',
			},
			missingArtifacts,
		});

		expect(readiness.state).toBe('queued');
		expect(readiness.reason).toContain('is queued and has not started');
		expect(readiness.reason).toContain('.aidd/spec.md');
	});

	test('terminal and waiting lifecycles are described by what really happened', () => {
		const outcomes = (['failed', 'stopped', 'waiting_approval'] as const).map((lifecycle) =>
			preCoding({
				activity: { kind: 'run', label: 'The coding run', lifecycle, reference: 'run_1' },
				missingArtifacts,
			}),
		);

		expect(outcomes.map((readiness) => readiness.state)).toEqual([
			'blocked',
			'blocked',
			'blocked',
		]);
		expect(outcomes[0]?.reason).toContain('The coding run failed.');
		expect(outcomes[1]?.reason).toContain('The coding run was stopped.');
		expect(outcomes[2]?.reason).toContain('The coding run is waiting for approval.');
		for (const readiness of outcomes) {
			expect(readiness.reason).not.toContain('in progress');
			expect(readiness.reason).toContain('.aidd/spec.md');
		}
	});

	test('a coding-phase verdict ignores setup context entirely', () => {
		const readiness = evaluateBlueprintReadiness(
			'coding',
			[templateShell, templateBacklog, productFirst, productLater],
			roadmap,
			{
				setup: {
					activity: {
						kind: 'run',
						label: 'The coding run',
						lifecycle: 'running',
						reference: 'run_1',
					},
					missingArtifacts,
				},
			},
		);

		expect(readiness.state).toBe('ready');
		expect(readiness.ready).toBe(true);
	});
});

// A missing roadmap.json and an unparseable one both arrive here as `roadmap === undefined`.
// Reporting the second as "must define an MVP milestone" sent the agent looking for a milestone in
// a file it could not parse, and the reason never changed, so every iteration repeated it.
describe('blueprint readiness and an unreadable roadmap', () => {
	test('names the parse failure when one was reported', () => {
		const readiness = evaluateBlueprintReadiness('coding', [productFirst], undefined, {
			roadmapError: 'Unexpected token } in JSON at position 42',
		});
		expect(readiness.state).toBe('blocked');
		expect(readiness.reason).toBe(
			'roadmap.json could not be read: Unexpected token } in JSON at position 42',
		);
	});

	test('still asks for an MVP milestone when the roadmap is simply absent', () => {
		const readiness = evaluateBlueprintReadiness('coding', [productFirst], undefined);
		expect(readiness.state).toBe('blocked');
		expect(readiness.reason).toBe('roadmap.json must define an MVP milestone.');
	});
});
