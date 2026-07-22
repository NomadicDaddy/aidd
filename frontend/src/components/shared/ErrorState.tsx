import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

export function ErrorState({
	error,
	message,
	onRetry,
	title,
}: {
	error?: unknown;
	message?: string;
	onRetry?: () => void;
	title?: string;
}) {
	const detail = message ?? (error instanceof Error ? error.message : 'Unknown error.');
	return (
		<Card className="border-red-200 bg-red-50 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
			<div className="flex items-start gap-2">
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="flex-1">
					{title ? <p className="font-medium">{title}</p> : null}
					<p className={title ? 'text-xs' : undefined}>{detail}</p>
				</div>
				{onRetry ? (
					<Button onClick={onRetry} variant="secondary">
						<RefreshCw className="h-4 w-4" />
						Retry
					</Button>
				) : null}
			</div>
		</Card>
	);
}
