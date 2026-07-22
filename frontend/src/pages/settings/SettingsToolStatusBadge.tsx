import type { SettingsToolStatus } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

import { Badge } from '../../components/ui/badge.tsx';

const statusTone: Record<SettingsToolStatus, Tone> = {
	available: 'emerald',
	configured: 'emerald',
	missing: 'amber',
	unavailable: 'red',
};

export function SettingsToolStatusBadge({ status }: { status: SettingsToolStatus }) {
	return (
		<Badge showDot tone={statusTone[status]}>
			{status}
		</Badge>
	);
}
