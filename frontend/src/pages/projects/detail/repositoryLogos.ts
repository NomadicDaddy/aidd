// ASCII-art "logos" for the Repository Info card's left panel — a compact block monogram per
// language, rendered in a monospace <pre>. Each carries a theme-aware accent color (light + dark
// variants) so the mark keeps contrast in both themes. Languages without a dedicated mark fall back
// to a generic git branch glyph. Mirrors the dominant-language detection in the backend service.

export interface LanguageLogo {
	/** Tailwind text-color classes (light + dark) applied to the <pre>. */
	accent: string;
	art: string;
}

const LOGOS: Record<string, LanguageLogo> = {
	CSS: {
		accent: 'text-blue-600 dark:text-blue-400',
		art: [
			' ████  █████ █████',
			'█      █     █    ',
			'█       ███   ███ ',
			'█          █     █',
			' ████  █████ █████',
		].join('\n'),
	},
	Go: {
		accent: 'text-teal-600 dark:text-teal-400',
		art: [' ████   ███ ', '█      █   █', '█  ██  █   █', '█   █  █   █', ' ████   ███ '].join(
			'\n',
		),
	},
	HTML: {
		accent: 'text-orange-600 dark:text-orange-400',
		art: ['  ▄█      █▄ ', '▄█    ██    █▄', ' ▀█   ██   █▀ ', '   ▀█    █▀   '].join('\n'),
	},
	JavaScript: {
		accent: 'text-yellow-600 dark:text-yellow-400',
		art: [
			'      █  █████',
			'      █  █    ',
			'      █  █████',
			'█     █      █',
			' █████   █████',
		].join('\n'),
	},
	Markdown: {
		accent: 'text-neutral-600 dark:text-neutral-300',
		art: [
			'█▄   ▄█  ████ ',
			'█ █ █ █  █   █',
			'█  █  █  █   █',
			'█     █  █   █',
			'█     █  ████ ',
		].join('\n'),
	},
	Python: {
		accent: 'text-sky-600 dark:text-sky-400',
		art: ['█████  █   █', '█   █  █   █', '█████   ███ ', '█        █  ', '█        █  '].join(
			'\n',
		),
	},
	Rust: {
		accent: 'text-orange-600 dark:text-orange-400',
		art: ['████   █████', '█   █  █    ', '████   █████', '█  █       █', '█   █  █████'].join(
			'\n',
		),
	},
	Shell: {
		accent: 'text-emerald-600 dark:text-emerald-400',
		art: ['█████  █   █', '█      █   █', '█████  █████', '    █  █   █', '█████  █   █'].join(
			'\n',
		),
	},
	SQL: {
		accent: 'text-indigo-600 dark:text-indigo-400',
		art: [
			'█████  █▄ ▄█  █    ',
			'█      █ █ █  █    ',
			'█████  █   █  █    ',
			'    █  █   █  █    ',
			'█████  █   █  █████',
		].join('\n'),
	},
	TypeScript: {
		accent: 'text-blue-600 dark:text-blue-400',
		art: ['█████  █████', '  █    █    ', '  █    █████', '  █        █', '  █    █████'].join(
			'\n',
		),
	},
};

const FALLBACK: LanguageLogo = {
	accent: 'text-neutral-500 dark:text-neutral-400',
	art: ['  ●        ', '  │        ', '  ├───●    ', '  │        ', '  ●        '].join('\n'),
};

export function logoForLanguage(language: null | string): LanguageLogo {
	if (language && language in LOGOS) return LOGOS[language] as LanguageLogo;
	return FALLBACK;
}
