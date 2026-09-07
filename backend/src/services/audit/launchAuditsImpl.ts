import type { RunService } from '../runService.ts';
import type { AuditLaunchInput } from './auditTypes.ts';

import { HttpError } from '../errors.ts';
import { normalizeAuditNames } from './auditHelpers.ts';

// Launch one audit (or review) run per selected project, collecting run ids and per-project
// failures. Keep this outside AuditService so the class stays under the 300-line cap; pass its
// dependencies explicitly rather than reaching back into the service.
export async function launchAuditsImpl(
	input: AuditLaunchInput,
	deps: {
		auditsEnabled: boolean;
		launchRun: RunService['launchRun'];
		recordRunStart?: (
			run: Awaited<ReturnType<RunService['launchRun']>>,
			auditNames: readonly string[],
		) => Promise<void>;
		resolveProject: (id: string) => Promise<string>;
	},
): Promise<{ failures: string[]; runIds: string[] }> {
	if (deps.auditsEnabled === false) throw new HttpError('Audits are disabled.', 409);
	const auditNames = input.auditAll ? [] : normalizeAuditNames(input.auditNames ?? []);
	if (!input.auditAll && auditNames.length === 0) {
		throw new HttpError('Select at least one audit or choose audit-all.', 400);
	}
	const runIds: string[] = [];
	const failures: string[] = [];
	for (const projectId of input.projectIds) {
		try {
			const projectDir = await deps.resolveProject(projectId);
			// A review is a verbatim-directive sweep over already-persisted findings, not a fresh
			// audit and not a feature-claiming run. It must launch as a directive: 'coding' + role
			// entered role mode, whose normal selection excludes audit-sourced features, and any
			// auditAll/auditNames on the request would flip the CLI into a fresh audit run that
			// ignores the review prompt entirely.
			const request = {
				mode: input.review ? 'directive' : 'audit',
				projectDir,
				...(input.backend !== undefined ? { backend: input.backend } : {}),
				...(input.model !== undefined ? { model: input.model } : {}),
				...(input.reasoningEffort !== undefined
					? { reasoningEffort: input.reasoningEffort }
					: {}),
				...(input.auditAll && !input.review ? { auditAll: true } : {}),
				...(!input.auditAll && !input.review ? { auditNames } : {}),
				...(input.review
					? {
							// Inline reviewer contract:
							// required reading, verify-don't-remediate boundary, and the structured
							// Review result output. Keep the full output contract when editing.
							prompt:
								`You are acting as a reviewer-auditor. Before judging any finding, ` +
								`consult /.aidd/assertions.md, /.aidd/spec.md, the most recent reports ` +
								`in /.aidd/audit-reports/, recent /.aidd/CHANGELOG.md entries, and ` +
								`/CONTEXT.md if present (use its vocabulary when describing findings). ` +
								`Review audit definitions and audit-backed findings for: ${
									input.auditAll ? 'all audits' : auditNames.join(', ')
								}. For each audit-sourced feature in .aidd/features/ (auditSource ` +
								`matching the audits above), verify the finding still reproduces against ` +
								`the current code. Annotate stale or resolved findings in the feature.json ` +
								`notes; do not remediate the findings themselves, and do not report ` +
								`speculative issues as confirmed defects. End with a "Review result" ` +
								`section containing: findings ordered by severity (or "none"), validation ` +
								`evidence for each verdict, required fixes before completion, residual ` +
								`risk, and counts of confirmed vs stale findings.`,
						}
					: {}),
			} satisfies Parameters<RunService['launchRun']>[0];
			const run = await deps.launchRun(request, {
				// Stamped by whoever asked, never inferred from the surface: a Run now on a
				// scheduled audit task arrives with source 'scheduled' and a person watching it.
				initiator: input.initiator,
				...(input.scheduledTaskExecutionId
					? { scheduledTaskExecutionId: input.scheduledTaskExecutionId }
					: {}),
				...(input.source ? { source: input.source } : {}),
			});
			await deps.recordRunStart?.(run, auditNames);
			runIds.push(run.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failures.push(`${projectId}: ${message}`);
		}
	}
	return { failures, runIds };
}
