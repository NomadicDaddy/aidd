import { default as ArrowLeftToLine } from 'lucide-react/dist/esm/icons/arrow-left-to-line';
import { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Radio } from 'lucide-react/dist/esm/icons/radio';

import type { RunOutputWindowRequest } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import {
	beginningWindow,
	formatTranscriptPosition,
	newerWindow,
	olderWindow,
	type TranscriptWindow,
} from './liveConsoleNavigation.ts';

export function LiveConsoleWindowNav({
	isBrowsing,
	isLoading,
	onRequest,
	onReturnLive,
	window,
}: {
	isBrowsing: boolean;
	isLoading: boolean;
	onRequest: (window: RunOutputWindowRequest) => void;
	onReturnLive: () => void;
	window: TranscriptWindow;
}) {
	const beginning = beginningWindow(window);
	const older = olderWindow(window);
	const newer = newerWindow(window);
	return (
		<div className="mb-2 flex flex-wrap items-center gap-2">
			<p aria-live="polite" className="mr-auto text-xs text-muted-foreground">
				{formatTranscriptPosition(window)} · {isBrowsing ? 'Earlier window' : 'Live end'}
			</p>
			<Button
				disabled={beginning === null || isLoading}
				onClick={() => beginning && onRequest(beginning)}
				size="compact"
				variant="ghost">
				<ArrowLeftToLine aria-hidden="true" className="h-3.5 w-3.5" />
				Beginning
			</Button>
			<Button
				disabled={older === null || isLoading}
				onClick={() => older && onRequest(older)}
				size="compact"
				variant="ghost">
				<ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
				Older
			</Button>
			<Button
				disabled={!isBrowsing || newer === null || isLoading}
				onClick={() => newer && onRequest(newer)}
				size="compact"
				variant="ghost">
				Newer
				<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
			</Button>
			{isBrowsing ? (
				<Button onClick={onReturnLive} size="compact" variant="secondary">
					<Radio aria-hidden="true" className="h-3.5 w-3.5" />
					Return to live
				</Button>
			) : null}
		</div>
	);
}
