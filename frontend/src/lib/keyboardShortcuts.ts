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

export interface NavigationShortcutDefinition extends Omit<ShortcutDefinition, 'keys'> {
	keys: [ShortcutKey, ShortcutKey];
	route: string;
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

export const navigationShortcuts: NavigationShortcutDefinition[] = [
	{ keys: ['g', 'd'], label: 'Go to Dashboard', route: '/', sequential: true },
	{ keys: ['g', 'p'], label: 'Go to Projects', route: '/projects', sequential: true },
	{ keys: ['g', 'r'], label: 'Go to Runs', route: '/runs', sequential: true },
];

export const refreshShortcut: ShortcutDefinition = {
	ariaKeyShortcuts: 'r',
	keys: ['r'],
	label: 'Refresh current data',
};

export const directiveShortcut: ShortcutDefinition = {
	ariaKeyShortcuts: 'd',
	keys: ['d'],
	label: 'Open directive launcher',
};

export function shortcutText(keys: ShortcutKey[]): string {
	return keys.join(' ');
}
