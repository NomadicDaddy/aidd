export type MaturityStageId =
	'audited' | 'engaged' | 'mapped' | 'planned' | 'shipped' | 'specified' | 'structured';

export type MaturityArtifactKind =
	| 'audit-dynamic'
	| 'catalog'
	| 'fs-any'
	| 'fs-dir'
	| 'fs-file'
	| 'synthetic-changelog'
	| 'synthetic-feature'
	| 'synthetic-release';

export interface MaturityArtifactRef {
	kind: MaturityArtifactKind;
	label: string;
	relativePath?: string;
	/** Candidate paths for `fs-any`: the artifact is present when any one exists. */
	relativePaths?: readonly string[];
	required: boolean;
	slug: string;
}

export type MaturityInvocation =
	| {
			args?: string;
			executionIntent: 'apply-changes' | 'review-only';
			kind: 'skill';
			postScript?: string;
			skillId: string;
	  }
	| { auditName?: string; kind: 'audit' }
	| { hint: string; kind: 'manual'; target: string }
	| { kind: 'feature' }
	| { kind: 'profile' };

export interface MaturityStageDef {
	artifacts: readonly MaturityArtifactRef[];
	description: string;
	id: MaturityStageId;
	label: string;
	order: number;
}

/**
 * Deploy-config shapes recognized as evidence for the `shipped` stage. The
 * artifact is present when any one exists; directories count when non-empty.
 */
export const SHIPPED_DEPLOY_CONFIG_PATHS: readonly string[] = [
	'.github/workflows',
	'Dockerfile',
	'docker-compose.production.yml',
	'fly.toml',
	'netlify.toml',
	'vercel.json',
	'wrangler.jsonc',
	'wrangler.toml',
];

export const MATURITY_STAGES: readonly MaturityStageDef[] = [
	{
		artifacts: [
			{ kind: 'catalog', label: 'spec.md', required: true, slug: 'spec.md' },
			{ kind: 'catalog', label: 'assertions.md', required: true, slug: 'assertions.md' },
			{
				kind: 'fs-file',
				label: 'CONTEXT.md',
				relativePath: 'CONTEXT.md',
				required: true,
				slug: 'CONTEXT.md',
			},
		],
		description: 'Product intent, behavioural assertions, and grounding context are captured.',
		id: 'specified',
		label: 'Specified',
		order: 1,
	},
	{
		artifacts: [
			{
				kind: 'catalog',
				label: 'project-structure.md',
				required: true,
				slug: 'project-structure.md',
			},
			{
				kind: 'fs-file',
				label: 'project.md',
				relativePath: '.aidd/project.md',
				required: true,
				slug: 'project.md',
			},
			{
				kind: 'catalog',
				label: 'project-profile.json',
				required: true,
				slug: 'project-profile.json',
			},
		],
		description: 'Project structure, manual project notes, and assurance profile are in place.',
		id: 'structured',
		label: 'Structured',
		order: 2,
	},
	{
		artifacts: [
			{ kind: 'catalog', label: 'screen-map.md', required: true, slug: 'screen-map.md' },
			{
				kind: 'catalog',
				label: 'testing-scenarios.md',
				required: true,
				slug: 'testing-scenarios.md',
			},
		],
		description: 'Screens and end-to-end testing scenarios are mapped out.',
		id: 'mapped',
		label: 'Mapped',
		order: 3,
	},
	{
		artifacts: [
			{ kind: 'catalog', label: 'roadmap.json', required: true, slug: 'roadmap.json' },
			{
				kind: 'synthetic-feature',
				label: '≥1 feature.json',
				required: true,
				slug: 'feature.json',
			},
		],
		description: 'Roadmap is set and at least one feature has been blueprinted.',
		id: 'planned',
		label: 'Planned',
		order: 4,
	},
	{
		artifacts: [
			{ kind: 'catalog', label: 'questions.md', required: true, slug: 'questions.md' },
			{
				kind: 'synthetic-changelog',
				label: 'CHANGELOG entries',
				required: true,
				slug: 'changelog.entries',
			},
			{
				kind: 'fs-dir',
				label: 'docs/',
				relativePath: 'docs',
				required: true,
				slug: 'docs/',
			},
		],
		description: 'Interview, changelog, and generated docs are actively maintained.',
		id: 'engaged',
		label: 'Engaged',
		order: 5,
	},
	{
		artifacts: [
			{
				kind: 'audit-dynamic',
				label: 'Profile audits',
				required: true,
				slug: 'audits',
			},
		],
		description: 'Profile-applicable audits run regularly and pass.',
		id: 'audited',
		label: 'Audited',
		order: 6,
	},
	{
		artifacts: [
			{
				kind: 'fs-file',
				label: 'deployment.md',
				relativePath: '.aidd/deployment.md',
				required: true,
				slug: 'deployment.md',
			},
			{
				kind: 'fs-any',
				label: 'Deploy config',
				relativePaths: SHIPPED_DEPLOY_CONFIG_PATHS,
				required: true,
				slug: 'deploy-config',
			},
			{
				kind: 'synthetic-release',
				label: 'Release tag',
				required: true,
				slug: 'release.tag',
			},
		],
		description:
			'A deployment runbook, deploy configuration, and at least one tagged release exist.',
		id: 'shipped',
		label: 'Shipped',
		order: 7,
	},
];

export const MATURITY_STAGE_ORDER: readonly MaturityStageId[] = MATURITY_STAGES.map((s) => s.id);

export function resolveInvocation(
	slug: string,
	appPath: string,
	auditName?: string,
): MaturityInvocation | null {
	const base = MATURITY_INVOCATIONS[slug];
	if (!base) return null;
	switch (base.kind) {
		case 'audit':
			return auditName === undefined ? { kind: 'audit' } : { auditName, kind: 'audit' };
		case 'feature':
			return base;
		case 'manual':
			return base;
		case 'profile':
			return base;
		case 'skill':
			return {
				...(base.args ? { args: base.args.replaceAll('{app}', appPath) } : {}),
				executionIntent: base.executionIntent,
				kind: 'skill',
				...(base.postScript
					? { postScript: base.postScript.replaceAll('{app}', appPath) }
					: {}),
				skillId: base.skillId,
			};
	}
}

export const MATURITY_SKIP_FILE = 'maturity.json';
export const MATURITY_STALE_DAYS = 30;
import { MATURITY_INVOCATIONS } from './maturity-invocations.ts';

export { MATURITY_INVOCATIONS } from './maturity-invocations.ts';
