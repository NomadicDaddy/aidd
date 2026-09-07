import { default as X } from 'lucide-react/dist/esm/icons/x';

import { cn } from '../../lib/cn.ts';
import {
	commandPaletteShortcut,
	directiveShortcut,
	navigationShortcuts,
	refreshShortcut,
	type ShortcutDefinition,
	terminalShortcut,
} from '../../lib/keyboardShortcuts.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { IconButton } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { ShortcutChord } from './KeyboardShortcut.tsx';

interface ShortcutGroup {
	heading: string;
	shortcuts: ShortcutDefinition[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		heading: 'Navigation',
		shortcuts: navigationShortcuts,
	},
	{
		heading: 'Actions',
		shortcuts: [
			commandPaletteShortcut,
			terminalShortcut,
			{ keys: ['/'], label: 'Focus search on this page' },
			refreshShortcut,
			directiveShortcut,
			{ keys: ['c'], label: 'Open Director chat' },
			{ keys: ['?'], label: 'Show this shortcuts overlay' },
		],
	},
];

export function ShortcutsOverlay({ onClose, open }: { onClose: () => void; open: boolean }) {
	return (
		<Dialog
			aria-labelledby="shortcuts-overlay-title"
			onClose={onClose}
			open={open}
			role="dialog">
			<DialogPanel className="w-full max-w-lg space-y-5 overflow-hidden border-border bg-card/95 p-5 backdrop-blur-xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2
							className="text-base font-semibold text-foreground"
							id="shortcuts-overlay-title">
							Keyboard shortcuts
						</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Available from anywhere except while typing in a field.
						</p>
					</div>
					<IconButton
						ariaLabel="Close shortcuts"
						className="-mt-1 -mr-1 border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
						onClick={onClose}
						variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<div className="space-y-4">
					{SHORTCUT_GROUPS.map((group) => (
						<section key={group.heading}>
							<div className={cn('mb-2', sectionCaptionClass)}>{group.heading}</div>
							<ul className="space-y-1.5">
								{group.shortcuts.map((shortcut) => (
									<li
										className="flex min-h-9 items-center justify-between gap-4 rounded-md border border-transparent px-2 py-1.5 hover:border-accent/20 hover:bg-accent-muted/50"
										key={shortcut.label}>
										<span className="text-sm text-foreground">
											{shortcut.label}
										</span>
										<ShortcutChord
											keys={shortcut.keys}
											sequential={shortcut.sequential ?? false}
										/>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</DialogPanel>
		</Dialog>
	);
}
