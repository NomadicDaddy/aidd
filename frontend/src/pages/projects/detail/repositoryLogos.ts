// ASCII-art "logos" for the Repository Info card's left panel — a compact block monogram per
// language, rendered in a monospace <pre>. Each carries a theme-aware accent color (light + dark
// variants) so the mark keeps contrast in both themes. Languages without a dedicated mark fall back
// to a generic git branch glyph. Mirrors the dominant-language detection in the backend service.
//
// The marks are drawn from the app's six-tone scale rather than per-language brand hues: the blue
// TypeScript mark was the only non-teal, non-status hue on the Repository tab and read as imported
// from another product.

import { toneText } from '../../../lib/tones.ts';

export interface LanguageLogo {
	/** Tone-scale text color applied to the <pre>, from `lib/tones.ts`. */
	accent: string;
	art: string;
}

const LOGOS: Record<string, LanguageLogo> = {
	CSS: {
		accent: toneText.violet,
		art: [
			' ████  █████ █████',
			'█      █     █    ',
			'█       ███   ███ ',
			'█          █     █',
			' ████  █████ █████',
		].join('\n'),
	},
	Go: {
		accent: toneText.teal,
		art: [' ████   ███ ', '█      █   █', '█  ██  █   █', '█   █  █   █', ' ████   ███ '].join(
			'\n',
		),
	},
	HTML: {
		accent: toneText.amber,
		art: ['  ▄█      █▄ ', '▄█    ██    █▄', ' ▀█   ██   █▀ ', '   ▀█    █▀   '].join('\n'),
	},
	JavaScript: {
		accent: toneText.amber,
		art: [
			'      █  █████',
			'      █  █    ',
			'      █  █████',
			'█     █      █',
			' █████   █████',
		].join('\n'),
	},
	Markdown: {
		accent: toneText.neutral,
		art: [
			'█▄   ▄█  ████ ',
			'█ █ █ █  █   █',
			'█  █  █  █   █',
			'█     █  █   █',
			'█     █  ████ ',
		].join('\n'),
	},
	Python: {
		accent: toneText.teal,
		art: ['█████  █   █', '█   █  █   █', '█████   ███ ', '█        █  ', '█        █  '].join(
			'\n',
		),
	},
	Rust: {
		accent: toneText.red,
		art: ['████   █████', '█   █  █    ', '████   █████', '█  █       █', '█   █  █████'].join(
			'\n',
		),
	},
	Shell: {
		accent: toneText.emerald,
		art: ['█████  █   █', '█      █   █', '█████  █████', '    █  █   █', '█████  █   █'].join(
			'\n',
		),
	},
	SQL: {
		accent: toneText.violet,
		art: [
			'█████  █▄ ▄█  █    ',
			'█      █ █ █  █    ',
			'█████  █   █  █    ',
			'    █  █   █  █    ',
			'█████  █   █  █████',
		].join('\n'),
	},
	TypeScript: {
		accent: toneText.teal,
		art: ['█████  █████', '  █    █    ', '  █    █████', '  █        █', '  █    █████'].join(
			'\n',
		),
	},
};

const FALLBACK: LanguageLogo = {
	accent: toneText.neutral,
	art: ['  ●        ', '  │        ', '  ├───●    ', '  │        ', '  ●        '].join('\n'),
};

export function logoForLanguage(language: null | string): LanguageLogo {
	if (language && language in LOGOS) return LOGOS[language] as LanguageLogo;
	return FALLBACK;
}
