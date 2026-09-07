import type { CredentialPendingAction } from './credentialBadgeTypes.ts';

import { Badge } from '../ui/badge.tsx';

const credentialLabels = {
	configuration: { configured: 'Configured', empty: 'Not set' },
	'web-store': { configured: 'Stored in this browser', empty: 'None stored in this browser' },
} as const;

const pendingCredentialStates = {
	clear: { label: 'Will clear on save', tone: 'red' },
	replace: { label: 'Will replace on save', tone: 'amber' },
	set: { label: 'Will configure on save', tone: 'amber' },
} as const satisfies Record<CredentialPendingAction, { label: string; tone: 'amber' | 'red' }>;

/** One canonical label and tone pair for each credential-state question the UI asks. */
export function CredentialBadge({
	configured,
	context = 'configuration',
	pendingAction,
}: {
	configured: boolean;
	context?: keyof typeof credentialLabels;
	pendingAction?: CredentialPendingAction | undefined;
}) {
	const labels = credentialLabels[context];
	const pendingState = pendingAction ? pendingCredentialStates[pendingAction] : undefined;
	return (
		<Badge tone={pendingState?.tone ?? (configured ? 'emerald' : 'neutral')}>
			{pendingState?.label ?? (configured ? labels.configured : labels.empty)}
		</Badge>
	);
}
