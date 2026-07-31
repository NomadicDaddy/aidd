import { toast } from 'sonner';

import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { useLaunchAudits } from '../../../hooks/useAudits.ts';
import { buildAuditLaunchRequest } from '../auditLaunchRequest.ts';

export function useCatalogAuditLauncher(input: {
	projectIds: string[];
	selectedAuditNames: string[];
}) {
	const launch = useLaunchAudits();

	function runAudits(
		review: boolean,
		auditAll: boolean | undefined,
		launchTarget: LaunchTargetValue,
	): void {
		if (!auditAll && input.selectedAuditNames.length === 0) return;
		launch.mutate(
			buildAuditLaunchRequest({
				auditAll: auditAll ?? false,
				auditNames: input.selectedAuditNames,
				launchTarget,
				projectIds: input.projectIds,
				review,
			}),
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Could not launch audits'),
				onSuccess: (result) => {
					if (result.runIds.length > 0) {
						toast.success(
							`Launched ${result.runIds.length} run${result.runIds.length === 1 ? '' : 's'}`,
						);
					}
					if (result.failures.length > 0) {
						toast.error('Some audit launches failed', {
							description: result.failures.slice(0, 2).join(' | '),
						});
					}
				},
			},
		);
	}

	return { launch, runAudits };
}
