import type { AuditLaunchRequest } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

function nonBlank(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

export function buildAuditLaunchRequest(input: {
	auditAll: boolean;
	auditNames: string[];
	launchTarget: LaunchTargetValue;
	projectIds: string[];
	review: boolean;
}): AuditLaunchRequest {
	const request: AuditLaunchRequest = {
		auditAll: input.auditAll,
		auditNames: input.auditAll ? [] : input.auditNames,
		projectIds: input.projectIds,
		review: input.review,
	};
	if (input.launchTarget.backend) request.backend = input.launchTarget.backend;
	const model = nonBlank(input.launchTarget.model);
	if (model) request.model = model;
	const reasoningEffort = nonBlank(input.launchTarget.reasoningEffort);
	if (reasoningEffort) request.reasoningEffort = reasoningEffort;
	return request;
}
