import type { ShortcutDefinition } from '../../lib/keyboardShortcuts.ts';

import { navigationShortcuts } from '../../lib/keyboardShortcuts.ts';
import { CommandShortcut } from '../ui/command.tsx';
import { ShortcutChord } from './KeyboardShortcut.tsx';

export function PaletteShortcut({ shortcut }: { shortcut: ShortcutDefinition }) {
	return (
		<CommandShortcut>
			<ShortcutChord
				keyClassName="h-5 min-w-5 px-1"
				keys={shortcut.keys}
				sequential={shortcut.sequential ?? false}
			/>
		</CommandShortcut>
	);
}

export function NavigationPaletteShortcut({ route }: { route: string }) {
	const shortcut = navigationShortcuts.find((candidate) => candidate.route === route);
	return shortcut ? <PaletteShortcut shortcut={shortcut} /> : null;
}
