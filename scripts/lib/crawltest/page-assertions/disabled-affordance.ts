import type { Page } from 'puppeteer';

import { DEFAULT_BASE_URL } from '../../../crawltest-types.ts';
import { clickButtonByText, isProjectDetailRoute } from './core.ts';

function parseRgb(value: string): [number, number, number] | null {
	const match = value.match(/rgba?\(([^)]+)\)/);
	const body = match?.[1];
	if (!body) return null;
	const parts = body.split(',').map((part) => Number.parseFloat(part.trim()));
	const [r, g, b] = parts;
	if (r === undefined || g === undefined || b === undefined) return null;
	if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
	return [r, g, b];
}

function colorChroma(value: string): null | number {
	const oklch = value.match(/oklch\(\s*[\d.]+%?\s+([\d.]+)/i);
	const chroma = oklch?.[1];
	if (chroma !== undefined) {
		const parsed = Number.parseFloat(chroma);
		return Number.isNaN(parsed) ? null : parsed;
	}
	const rgb = parseRgb(value);
	if (!rgb) return null;
	const [r, g, b] = rgb;
	const spread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
	return spread / 255;
}

function isNeutralColor(value: string): boolean {
	const chroma = colorChroma(value);
	if (chroma === null) return false;
	return chroma <= 0.045;
}

async function disabledActionState(
	page: Page,
	textIncludes: string
): Promise<{ background: string; disabled: boolean } | null> {
	// Passing the needle as an argument keeps this out of code-construction territory. It also
	// drops the `as` cast the string form needed: the callback's return type is inferred, so a
	// change to the shape below is now a type error rather than a lie the cast waves through.
	return page.evaluate((needle) => {
		const buttons = Array.from(document.querySelectorAll('button'));
		const button = buttons.find((item) => (item.textContent || '').trim().includes(needle));
		if (!button) return null;
		return {
			background: getComputedStyle(button).backgroundColor,
			disabled: button.disabled,
		};
	}, textIncludes);
}

export async function assertDisabledActionAffordance(page: Page, route: string): Promise<string[]> {
	const errors: string[] = [];

	let pathname: string;
	try {
		pathname = new URL(route, DEFAULT_BASE_URL).pathname;
	} catch {
		pathname = route;
	}

	if (pathname === '/recipes') {
		const launch = await disabledActionState(page, 'Launch');
		if (!launch) return errors;
		if (!launch.disabled) {
			errors.push(`${route} Launch action was not disabled without a launch target`);
		} else if (!isNeutralColor(launch.background)) {
			errors.push(
				`${route} disabled Launch action still reads as a primary action (${launch.background})`
			);
		}
		return errors;
	}

	if (isProjectDetailRoute(route)) {
		const opened = await clickButtonByText(page, 'Management');
		if (!opened) return errors;
		try {
			await page.waitForFunction(
				"Array.from(document.querySelectorAll('button')).some((item) => (item.textContent || '').trim().includes('Move project'))",
				{ timeout: 5_000 }
			);
		} catch {
			return errors;
		}
		const move = await disabledActionState(page, 'Move project');
		if (!move) return errors;
		if (!move.disabled) {
			errors.push(`${route} Move project action was not disabled without a destination root`);
		} else if (!isNeutralColor(move.background)) {
			errors.push(
				`${route} disabled Move project action still reads as a primary action (${move.background})`
			);
		}
		return errors;
	}

	return errors;
}
