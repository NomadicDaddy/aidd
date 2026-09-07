import type { ReactNode } from 'react';

import { useId, useState } from 'react';

import { cn } from '../../lib/cn.ts';
import { Button } from '../ui/button.tsx';
import { DisclosureMarker } from './DisclosureMarker.tsx';

/** Keeps a toolbar's secondary action rail reachable without consuming the phone viewport. */
export function FilterToolbarStackedActions({
	actionRole,
	actions,
}: {
	actionRole?: 'bulk' | 'display' | 'page' | undefined;
	actions: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();

	return (
		<>
			<Button
				aria-controls={panelId}
				aria-expanded={open}
				className="w-full justify-between @min-[36rem]:hidden"
				onClick={() => setOpen((current) => !current)}>
				Actions
				<DisclosureMarker open={open} />
			</Button>
			<div
				className={cn('justify-end @min-[36rem]:flex', open ? 'flex' : 'hidden')}
				data-action-role={actionRole}
				id={panelId}>
				{actions}
			</div>
		</>
	);
}
