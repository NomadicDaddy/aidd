import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { Link } from 'react-router-dom';

import type { ProjectDiscoverySkippedRoot } from '../../api/types.ts';

import { IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';

export function SkippedRootsWarning({
	onDismiss,
	skippedRoots,
}: {
	onDismiss: () => void;
	skippedRoots: ProjectDiscoverySkippedRoot[];
}) {
	return (
		<Card className="border-amber-200 bg-amber-50 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
			<div className="flex items-start gap-2">
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="flex-1 space-y-1">
					<p className="font-medium">
						{skippedRoots.length === 1
							? '1 configured root was skipped during discovery.'
							: `${skippedRoots.length} configured roots were skipped during discovery.`}
					</p>
					<ul className="space-y-0.5 text-xs">
						{skippedRoots.map((root) => (
							<li className="break-all" key={root.path}>
								<span className="font-mono">{root.path}</span> — {root.reason}
							</li>
						))}
					</ul>
					<p className="text-xs">
						Update application roots on the{' '}
						<Link className="underline" to="/settings">
							Settings
						</Link>{' '}
						page and click Discover Projects to retry.
					</p>
				</div>
				<IconButton
					ariaLabel="Dismiss skipped roots warning"
					className="border-0 bg-transparent text-amber-900 hover:bg-amber-100 hover:text-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
					onClick={onDismiss}
					variant="ghost">
					<X className="h-4 w-4" />
				</IconButton>
			</div>
		</Card>
	);
}
