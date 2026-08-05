import { default as Rocket } from 'lucide-react/dist/esm/icons/rocket';

import { cn } from '../../lib/cn.ts';
import { Button } from '../ui/button.tsx';

/**
 * The rail's action anchor.
 *
 * `secondary` rather than `ghost`: launching a directive is the one thing in the bottom block that
 * starts work, and as a ghost row it carried exactly the same weight as "Report" and the two
 * preference toggles. `Rocket` rather than `Play` for the same reason the nav glyphs are unique —
 * `Play` is the Runs destination.
 */
export function DirectiveLaunchButton({
	collapsed,
	onClick,
}: {
	collapsed: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			aria-label="Launch a project directive"
			className={cn('px-0', collapsed ? 'w-10' : 'w-10 sm:w-full sm:justify-start sm:px-3')}
			onClick={onClick}
			type="button"
			variant="secondary">
			<Rocket className="h-4 w-4" />
			{!collapsed && <span className="hidden text-sm font-medium sm:inline">Directive</span>}
		</Button>
	);
}
