import type { PipelineExecutionIdentity } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';

function identityKey(identity: PipelineExecutionIdentity): string {
	return [
		identity.backend ?? '',
		identity.model ?? '',
		identity.provider ?? '',
		identity.reasoningEffort ?? '',
	].join('\u001f');
}

export function PipelineSessionIdentityBadges({
	identities,
}: {
	identities: PipelineExecutionIdentity[];
}) {
	if (identities.length === 0) {
		return <span className="text-neutral-400 dark:text-neutral-600">—</span>;
	}
	return (
		<span className="inline-flex max-w-full flex-wrap gap-1">
			{identities.map((identity, index) => (
				<ExecutionIdentityBadges
					{...identity}
					hint={
						identities.length > 1
							? `Pipeline runtime ${index + 1} of ${identities.length}`
							: undefined
					}
					key={identityKey(identity)}
				/>
			))}
		</span>
	);
}
