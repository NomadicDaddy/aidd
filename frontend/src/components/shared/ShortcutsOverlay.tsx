import { default as X } from 'lucide-react/dist/esm/icons/x';

import {
	commandPaletteShortcut,
	type ShortcutDefinition,
	terminalShortcut,
} from '../../lib/keyboardShortcuts.ts';
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
		shortcuts: [
			{ keys: ['g', 'd'], label: 'Go to Dashboard' },
			{ keys: ['g', 'p'], label: 'Go to Projects' },
			{ keys: ['g', 'r'], label: 'Go to Runs' },
		],
	},
	{
		heading: 'Actions',
		shortcuts: [
			commandPaletteShortcut,
			terminalShortcut,
			{ keys: ['/'], label: 'Focus search on this page' },
			{ keys: ['r'], label: 'Refresh current data' },
			{ keys: ['d'], label: 'Open directive launcher' },
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
			<DialogPanel className="w-full max-w-lg space-y-5 overflow-hidden bg-white/95 p-5 backdrop-blur-xl dark:bg-slate-950/95">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2
							className="text-base font-semibold text-foreground"
							id="shortcuts-overlay-title">
							Keyboard shortcuts
						</h2>
						<p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
							Available from anywhere except while typing in a field.
						</p>
					</div>
					<IconButton
						ariaLabel="Close shortcuts"
						className="-mt-1 -mr-1 border-0 bg-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-slate-800 dark:hover:text-neutral-100"
						onClick={onClose}
						variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<div className="space-y-4">
					{SHORTCUT_GROUPS.map((group) => (
						<section key={group.heading}>
							<div className="mb-2 text-[0.65rem] font-semibold text-neutral-500 uppercase dark:text-neutral-500">
								{group.heading}
							</div>
							<ul className="space-y-1.5">
								{group.shortcuts.map((shortcut) => (
									<li
										className="flex min-h-9 items-center justify-between gap-4 rounded-md border border-transparent px-2 py-1.5 hover:border-teal-100 hover:bg-teal-50/50 dark:hover:border-teal-950/70 dark:hover:bg-teal-950/20"
										key={shortcut.label}>
										<span className="text-sm text-neutral-700 dark:text-neutral-300">
											{shortcut.label}
										</span>
										<ShortcutChord keys={shortcut.keys} />
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
