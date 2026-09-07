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
			// `w-11` below `sm`, `w-10` from there. The `default` size already reaches `min-h-11` on
			// a phone, so the `w-10` this carried made it 40x44 — a control that took the floor on
			// one axis and missed it on the other, which is exactly the shape the guard could not
			// see: its regex reads the first quoted string in a `cn(...)` call, and `w-10` was in
			// the second.
			className={cn(
				'px-0',
				collapsed ? 'w-11 sm:w-10' : 'w-11 sm:w-full sm:justify-start sm:px-3',
			)}
			onClick={onClick}
			type="button"
			variant="secondary">
			<Rocket className="h-4 w-4" />
			{!collapsed && <span className="hidden text-sm font-medium sm:inline">Directive</span>}
		</Button>
	);
}
