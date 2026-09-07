import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import { cn } from '../../lib/cn.ts';

/** The single marker used by native and state-controlled disclosure triggers. */
export function DisclosureMarker({ open }: { open?: boolean }) {
	return (
		<ChevronRight
			aria-hidden="true"
			className={cn(
				'h-3.5 w-3.5 shrink-0 text-current transition-transform duration-150 motion-reduce:transition-none',
				open === undefined ? 'group-open:rotate-90' : open && 'rotate-90',
			)}
		/>
	);
}
