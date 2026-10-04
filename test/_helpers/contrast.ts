import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * WCAG contrast arithmetic for the frontend's colour contracts, read from the real sources: the
 * theme tokens in index.css and Tailwind's own palette, so an assertion cannot drift from either.
 */

export type Rgb = readonly [number, number, number];

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

export const frontendSource = (path: string): Promise<string> =>
	readFile(resolve(FRONTEND_SRC, path), 'utf8');

export function parseHex(hex: string): Rgb {
	const channel = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16);
	return [channel(1), channel(3), channel(5)];
}

function channelLuminance(value: number): number {
	const channel = value / 255;
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
	return (
		0.2126 * channelLuminance(red) +
		0.7152 * channelLuminance(green) +
		0.0722 * channelLuminance(blue)
	);
}

export function contrast(a: Rgb, b: Rgb): number {
	const [first, second] = [luminance(a), luminance(b)];
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Alpha compositing happens in gamma space in every browser, so the blend is a plain per-channel
 * mix of the two sRGB values. Doing it in linear space here would flatter the result by roughly a
 * tenth of a point and quietly hide a colour that is actually under the floor.
 */
export function composite([fr, fg, fb]: Rgb, [br, bg, bb]: Rgb, alpha: number): Rgb {
	const mix = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha));
	return [mix(fr, br), mix(fg, bg), mix(fb, bb)];
}

/** The custom-property block for one theme, so a token is read per theme and not once globally. */
export function themeTokens(css: string, selector: string): Map<string, string> {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) throw new Error(`no ${selector} block in index.css`);
	const block = css.slice(start, css.indexOf('\n}', start));
	const tokens = new Map<string, string>();
	for (const match of block.matchAll(/^\t(--[a-z-]+):\s*(#[0-9a-f]{6});$/gmu)) {
		const [, name, value] = match;
		if (name && value) tokens.set(name, value);
	}
	return tokens;
}

/** Reads one token as a colour, so a renamed or removed token fails loudly instead of as `NaN`. */
export function token(tokens: Map<string, string>, name: string): Rgb {
	const value = tokens.get(name);
	if (!value) throw new Error(`no ${name} in this theme block`);
	return parseHex(value);
}

const TAILWIND_THEME = resolve(
	import.meta.dir,
	'../../frontend/node_modules/tailwindcss/theme.css',
);

/** Oklab to linear sRGB, per Björn Ottosson's reference matrices, then the sRGB transfer curve. */
function oklchToRgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
	const hue = (hueDegrees * Math.PI) / 180;
	const a = chroma * Math.cos(hue);
	const b = chroma * Math.sin(hue);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const encode = (value: number) => {
		const clamped = Math.min(1, Math.max(0, value));
		const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
		return Math.round(gamma * 255);
	};
	return [encode(linear[0] ?? 0), encode(linear[1] ?? 0), encode(linear[2] ?? 0)];
}

/** A Tailwind palette colour such as `amber-700`, from the installed theme rather than a copy. */
export async function tailwindColor(name: string): Promise<Rgb> {
	const theme = await readFile(TAILWIND_THEME, 'utf8');
	const match = new RegExp(
		String.raw`--color-${name}:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)`,
		'u',
	).exec(theme);
	if (!match?.[1] || !match[2] || !match[3]) throw new Error(`no --color-${name} in theme.css`);
	return oklchToRgb(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
}
