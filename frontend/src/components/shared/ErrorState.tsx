import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { cn } from '../../lib/cn.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
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
		<Card className={cn('text-sm', toneBorder.red, toneSurface.red, toneText.red)}>
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
