import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as WrapText } from 'lucide-react/dist/esm/icons/wrap-text';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { ConsoleView } from './liveConsolePrefs.ts';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';

export function LiveConsoleControls({
	find,
	matchCount,
	onCopyAll,
	onFindChange,
	onViewChange,
	onWrapToggle,
	view,
	wrap,
}: {
	find: string;
	matchCount: null | number;
	onCopyAll: () => void;
	onFindChange: (value: string) => void;
	onViewChange: (view: ConsoleView) => void;
	onWrapToggle: () => void;
	view: ConsoleView;
	wrap: boolean;
}) {
	return (
		<div className="mb-2 flex flex-wrap items-center gap-2">
			<div className="relative w-full sm:w-56">
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					aria-label="Find in console"
					className="w-full pr-8 pl-8"
					onChange={(event) => onFindChange(event.target.value)}
					placeholder="Find in console"
					type="text"
					value={find}
				/>
				{find ? (
					<IconButton
						ariaLabel="Clear find"
						className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
						onClick={() => onFindChange('')}
						variant="ghost">
						<X aria-hidden="true" className="h-3.5 w-3.5" />
					</IconButton>
				) : null}
			</div>
			{matchCount !== null ? (
				<span className="text-xs text-muted-foreground">
					{matchCount} {matchCount === 1 ? 'match' : 'matches'}
				</span>
			) : null}
			<div className="flex items-center gap-2 sm:ml-auto">
				<div
					aria-label="Console view"
					className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
					role="group">
					<Button
						aria-pressed={view === 'pretty'}
						className={view === 'pretty' ? '' : 'border-transparent'}
						onClick={() => onViewChange('pretty')}
						size="compact"
						variant={view === 'pretty' ? 'secondary' : 'ghost'}>
						Pretty
					</Button>
					<Button
						aria-pressed={view === 'raw'}
						className={view === 'raw' ? '' : 'border-transparent'}
						onClick={() => onViewChange('raw')}
						size="compact"
						variant={view === 'raw' ? 'secondary' : 'ghost'}>
						Raw
					</Button>
				</div>
				{view === 'raw' ? (
					<Button aria-pressed={wrap} onClick={onWrapToggle} variant="ghost">
						<WrapText aria-hidden="true" className="h-3.5 w-3.5" />
						{wrap ? 'No wrap' : 'Wrap'}
					</Button>
				) : null}
				<Button onClick={onCopyAll} variant="ghost">
					<Copy aria-hidden="true" className="h-3.5 w-3.5" />
					Copy all
				</Button>
			</div>
		</div>
	);
}
