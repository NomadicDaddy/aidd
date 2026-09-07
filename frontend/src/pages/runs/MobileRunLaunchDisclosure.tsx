import type { ReactNode } from 'react';

import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { useId, useState } from 'react';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';

/** Leaves the launch workflow available on phone without pushing run data below the fold. */
export function MobileRunLaunchDisclosure({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const panelId = useId();

	return (
		<>
			<Button
				aria-controls={panelId}
				aria-expanded={open}
				className="w-full justify-between sm:hidden"
				onClick={() => setOpen((current) => !current)}
				variant="secondary">
				<span className="inline-flex items-center gap-2">
					<Play aria-hidden="true" className="h-4 w-4 text-accent" />
					Launch Run
				</span>
				<DisclosureMarker open={open} />
			</Button>
			<div className={cn('space-y-5 sm:block', !open && 'hidden')} id={panelId}>
				{children}
			</div>
		</>
	);
}
