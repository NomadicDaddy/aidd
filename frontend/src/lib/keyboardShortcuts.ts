export type ShortcutKey = string;

export interface ShortcutDefinition {
	ariaKeyShortcuts?: string;
	keys: ShortcutKey[];
	label: string;
	/**
	 * True when the keys are pressed one after another (`g` then `d`). Absent means a chord held
	 * together, which is what the rendered separator has to distinguish.
	 */
	sequential?: boolean;
}

const isApplePlatform =
	typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const commandPaletteShortcut: ShortcutDefinition = {
	ariaKeyShortcuts: isApplePlatform ? 'Meta+K' : 'Control+K',
	keys: [isApplePlatform ? '⌘' : 'Ctrl', 'K'],
	label: 'Open command palette',
};

export const terminalShortcut: ShortcutDefinition = {
	ariaKeyShortcuts: 'Control+`',
	keys: ['Ctrl', '`'],
	label: 'Toggle terminal',
};

export function shortcutText(keys: ShortcutKey[]): string {
	return keys.join(' ');
}
