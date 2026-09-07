import { default as SquareTerminal } from 'lucide-react/dist/esm/icons/square-terminal';

import { openTerminalPaneAt } from '../../components/terminal/terminalSessions.ts';
import { IconButton } from '../../components/ui/button.tsx';

/** Opens the docked terminal pane on a tab rooted at `path` (reusing one already there). */
export function OpenInTerminalButton({ path }: { path: string }) {
	return (
		<IconButton
			ariaLabel="Open a terminal in this project's directory"
			onClick={() => void openTerminalPaneAt(path)}
			variant="ghost">
			<SquareTerminal className="h-4 w-4" />
		</IconButton>
	);
}
