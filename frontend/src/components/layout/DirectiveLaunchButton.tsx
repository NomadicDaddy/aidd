import { default as Play } from 'lucide-react/dist/esm/icons/play';

import { cn } from '../../lib/cn.ts';
import { Button } from '../ui/button.tsx';

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
			variant="ghost">
			<Play className="h-4 w-4" />
			{!collapsed && <span className="hidden text-sm font-medium sm:inline">Directive</span>}
		</Button>
	);
}
