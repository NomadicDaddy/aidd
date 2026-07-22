import type { MaturityInvocation } from './maturity.ts';

export const MATURITY_INVOCATIONS: Readonly<Record<string, MaturityInvocation>> = {
	'assertions.md': {
		args: '{app}/.aidd/assertions.md',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'review-or-create-doc',
	},
	audits: { kind: 'audit' },
	'changelog.entries': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'document-changes',
	},
	'CONTEXT.md': {
		hint: 'Run the external grill-with-docs skill from the canonical AI catalog to create or refresh CONTEXT.md.',
		kind: 'manual',
		target: 'CONTEXT.md',
	},
	'deploy-config': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'deployment-readiness',
	},
	'deployment.md': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'deployment-readiness',
	},
	'docs/': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'document-changes',
	},
	'feature.json': { kind: 'feature' },
	'project-profile.json': { kind: 'profile' },
	'project-structure.md': {
		args: '{app}/.aidd/project-structure.md',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'review-or-create-doc',
	},
	'project.md': {
		hint: 'Edit .aidd/project.md directly — this file is maintained by hand.',
		kind: 'manual',
		target: '.aidd/project.md',
	},
	'questions.md': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'onboarding-interview',
	},
	'release.tag': {
		hint: 'Tag a release (e.g. `git tag v1.0.0`) once the app ships — or run the deploy recipe, which tags on success.',
		kind: 'manual',
		target: 'git tag',
	},
	'roadmap.json': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		postScript: 'bun run aidd-tools -- roadmap:apply --project-dir {app}',
		skillId: 'update-roadmap',
	},
	'screen-map.md': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'update-screen-map',
	},
	'spec.md': {
		args: '{app}/.aidd/spec.md',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'review-or-create-doc',
	},
	'testing-scenarios.md': {
		args: '{app}',
		executionIntent: 'apply-changes',
		kind: 'skill',
		skillId: 'testing-scenarios',
	},
};
