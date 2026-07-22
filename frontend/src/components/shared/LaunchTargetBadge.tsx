import { ExecutionIdentityBadges } from './ExecutionIdentityBadges.tsx';

// Read-only variant for surfaces whose target comes from persisted configuration rather
// than a per-launch choice (Director cycles use the director profile).
export function LaunchTargetBadge({
	backend,
	hint,
	model,
	provider,
	reasoningEffort,
}: {
	backend: string;
	hint?: string;
	model?: null | string;
	provider?: null | string | undefined;
	reasoningEffort?: null | string | undefined;
}) {
	return (
		<ExecutionIdentityBadges
			backend={backend}
			hint={hint}
			model={model}
			provider={provider}
			reasoningEffort={reasoningEffort}
		/>
	);
}
