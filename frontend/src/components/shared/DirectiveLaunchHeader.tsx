import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import { IconButton } from '../ui/button.tsx';

interface DirectiveLaunchHeaderProps {
	onClose: () => void;
}

export function DirectiveLaunchHeader({ onClose }: DirectiveLaunchHeaderProps) {
	return (
		<div className="flex flex-none items-start justify-between gap-3 px-5 pt-5">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<ShieldCheck aria-hidden className="h-4 w-4 text-accent" />
					<h2 className="text-base font-semibold" id="directive-launch-title">
						Launch directive
					</h2>
				</div>
				<p className="mt-1 text-sm text-muted-foreground" id="directive-launch-description">
					Send a free-text instruction to one project as a supervised run.
				</p>
			</div>
			<IconButton ariaLabel="Close directive launcher" onClick={onClose} variant="ghost">
				<X className="h-4 w-4" />
			</IconButton>
		</div>
	);
}
