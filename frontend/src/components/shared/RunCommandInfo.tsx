import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { toast } from 'sonner';

import type { RunLaunchCommand } from '../../api/types.ts';

import { Button } from '../ui/button.tsx';
import { Tooltip } from '../ui/tooltip.tsx';

function commandAriaLabel(command: null | RunLaunchCommand, runId: string): string {
	if (!command) return `Command unavailable for run ${runId}`;
	return `Copy command for run ${runId}`;
}

export function RunCommandInfo({
	command,
	runId,
}: {
	command: null | RunLaunchCommand;
	runId: string;
}) {
	const content = command ? (
		<code className="block font-mono text-[0.7rem] break-all whitespace-normal">
			{command.display}
		</code>
	) : (
		<span>Command metadata is unavailable for this run.</span>
	);

	return (
		<Tooltip className="px-3 py-2 text-left" content={content} maxWidth="wide" side="bottom">
			<Button
				aria-label={commandAriaLabel(command, runId)}
				className="sm:h-7 sm:w-7"
				onClick={() => {
					if (!command) {
						toast.error('Command metadata is unavailable for this run');
						return;
					}
					void navigator.clipboard
						.writeText(command.display)
						.then(() => toast.success('Command copied'))
						.catch(() => toast.error('Could not copy command'));
				}}
				size="icon"
				variant="ghost">
				<Copy aria-hidden="true" className="h-3.5 w-3.5" />
			</Button>
		</Tooltip>
	);
}
