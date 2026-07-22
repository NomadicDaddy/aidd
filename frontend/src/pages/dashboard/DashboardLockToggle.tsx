import { default as Lock } from 'lucide-react/dist/esm/icons/lock';
import { default as LockOpen } from 'lucide-react/dist/esm/icons/lock-open';

import { IconButton } from '../../components/ui/button.tsx';
import { useDashboardStore } from '../../stores/dashboardStore.ts';

export function DashboardLockToggle() {
	const locked = useDashboardStore((state) => state.locked);
	const toggleLocked = useDashboardStore((state) => state.toggleLocked);
	const Icon = locked ? Lock : LockOpen;
	return (
		<IconButton
			aria-pressed={!locked}
			ariaLabel={locked ? 'Unlock card layout for reordering' : 'Lock card layout'}
			onClick={toggleLocked}
			variant={locked ? 'secondary' : 'primary'}>
			<Icon className="h-4 w-4" />
		</IconButton>
	);
}
