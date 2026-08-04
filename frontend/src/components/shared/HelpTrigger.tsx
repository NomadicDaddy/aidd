import { default as CircleHelp } from 'lucide-react/dist/esm/icons/circle-help';
import { useState } from 'react';

import { IconButton } from '../ui/button.tsx';
import { Tooltip } from '../ui/tooltip.tsx';
import { HelpDrawer } from './HelpDrawer.tsx';

/**
 * Page-header affordance that opens the contextual help drawer for a given doc
 * `slug`. Click-only — the global `?` shortcut is reserved for the keyboard
 * shortcuts overlay.
 */
export function HelpTrigger({ slug }: { slug: string }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Tooltip content="Open help for this page">
				<IconButton
					ariaLabel="Open help for this page"
					className="border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={() => setOpen(true)}
					variant="ghost">
					<CircleHelp className="h-4 w-4" />
				</IconButton>
			</Tooltip>
			<HelpDrawer onClose={() => setOpen(false)} open={open} slug={slug} />
		</>
	);
}
