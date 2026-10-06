import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import { MATURITY_INVOCATIONS, resolveInvocation } from 'aidd-shared/metadata/maturity';

import type { AuditLaunchInput } from '../audit/auditTypes.ts';
import type { PipelineService } from '../pipelineService.ts';

import { normalizeAuditName } from '../audit/auditHelpers.ts';
import { HttpError } from '../errors.ts';
import { SKILL_RECIPE_PREFIX } from '../recipeService.ts';

export const AUDIT_ACTION_SLUG_PREFIX = 'audit:';

/**
 * What a maturity action needs from the services, named narrowly so the dispatch is testable
 * without a route or a WebContext. Audits go through the audit launch service, never
 * `runService.launchRun` directly: that service owns the audits-disabled refusal and the
 * telemetry start, and a card launch must get both.
 */
export interface MaturityRunNextDeps {
	ensureProfile: (projectId: string) => Promise<void>;
	launchAudits: (input: AuditLaunchInput) => Promise<{ failures: string[]; runIds: string[] }>;
	launchRecipe: PipelineService['launchRecipe'];
	resolveProject: (projectId: string) => Promise<string>;
}

export interface MaturityRunNextInput {
	auditName?: string | undefined;
	launchTarget?: LaunchTargetOverrides;
	projectId: string;
	slug: string;
}

export interface MaturityRunNextResult {
	args?: string;
	auditName?: string;
	command?: string;
	hint?: string;
	invocation: string;
	postScript?: string;
	runId?: string;
	sessionId?: string;
	skillId?: string;
	slug: string;
	target?: string;
}

export function normalizeRunNextInput(
	slug: string,
	auditName: string | undefined,
): { auditName?: string; invocationSlug: string; responseSlug: string } {
	if (!slug.startsWith(AUDIT_ACTION_SLUG_PREFIX)) {
		return {
			...(auditName ? { auditName } : {}),
			invocationSlug: slug,
			responseSlug: slug,
		};
	}
	const slugAuditName = slug.slice(AUDIT_ACTION_SLUG_PREFIX.length).trim();
	if (!slugAuditName) throw new HttpError('auditName is required for audit invocations', 400);
	if (auditName && auditName !== slugAuditName) {
		throw new HttpError('auditName must match the audit action slug', 400);
	}
	return { auditName: slugAuditName, invocationSlug: 'audits', responseSlug: slug };
}

export async function dispatchMaturityRunNext(
	deps: MaturityRunNextDeps,
	input: MaturityRunNextInput,
): Promise<MaturityRunNextResult> {
	const launchTarget = input.launchTarget ?? {};
	const projectDir = await deps.resolveProject(input.projectId);
	const normalized = normalizeRunNextInput(input.slug, input.auditName);
	const definition = MATURITY_INVOCATIONS[normalized.invocationSlug];
	if (!definition) throw new HttpError(`Unknown maturity slug: ${input.slug}`, 400);
	const invocation = resolveInvocation(
		normalized.invocationSlug,
		projectDir,
		normalized.auditName,
	);
	if (!invocation) throw new HttpError(`Unable to resolve invocation for ${input.slug}`, 400);
	switch (invocation.kind) {
		case 'audit': {
			if (!normalized.auditName) {
				throw new HttpError('auditName is required for audit invocations', 400);
			}
			// The name is validated here, before any launcher is consulted, so a traversal is a
			// 400 and never a launch. One project, one audit: the service refuses when audits are
			// disabled (409) and records the telemetry start; a per-project failure is the
			// launch's own error, surfaced as the request's.
			const auditName = normalizeAuditName(normalized.auditName);
			const { failures, runIds } = await deps.launchAudits({
				auditNames: [auditName],
				initiator: 'operator',
				projectIds: [input.projectId],
				...(launchTarget.backend !== undefined ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model !== undefined ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort !== undefined
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			});
			const runId = runIds[0];
			if (runId === undefined)
				throw new HttpError(failures[0] ?? 'Audit did not launch', 400);
			return {
				auditName: normalized.auditName,
				invocation: 'audit',
				runId,
				slug: normalized.responseSlug,
			};
		}
		case 'feature': {
			return {
				hint: 'Navigate to feature creation flow.',
				invocation: 'feature',
				slug: input.slug,
			};
		}
		case 'manual': {
			return {
				hint: invocation.hint,
				invocation: 'manual',
				slug: input.slug,
				target: invocation.target,
			};
		}
		case 'profile': {
			await deps.ensureProfile(input.projectId);
			return {
				hint: 'Created .aidd/project-profile.json from the inferred profile.',
				invocation: invocation.kind,
				slug: input.slug,
				target: '.aidd/project-profile.json',
			};
		}
		case 'skill': {
			const session = await deps.launchRecipe({
				initiator: 'operator',
				launchTarget,
				parameters: {
					args: invocation.args ?? '',
					backend: '',
					executionIntent: invocation.executionIntent,
					model: '',
				},
				projectDir,
				recipeId: `${SKILL_RECIPE_PREFIX}${invocation.skillId}`,
			});
			return {
				command: `${invocation.skillId}${invocation.args ? ` ${invocation.args}` : ''}`,
				invocation: invocation.kind,
				...(invocation.args ? { args: invocation.args } : {}),
				...(invocation.postScript ? { postScript: invocation.postScript } : {}),
				sessionId: session.id,
				skillId: invocation.skillId,
				slug: input.slug,
			};
		}
	}
}
