import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

async function source(file: string): Promise<string> {
	return await Bun.file(resolve(FRONTEND_SRC, file)).text();
}

/** The opening `<Button …>` tag starting at `start`, brace- and quote-aware. */
function openingTag(src: string, start: number): string {
	let index = start + 1;
	let depth = 0;
	let quote = '';
	while (index < src.length) {
		const character = src[index];
		if (quote) {
			if (character === quote) quote = '';
		} else if (character === '"' || character === "'" || character === '`') {
			quote = character;
		} else if (character === '{') depth += 1;
		else if (character === '}') depth -= 1;
		else if (character === '>' && depth === 0) break;
		index += 1;
	}
	return src.slice(start, index + 1);
}

/** Every `<Button>` in a file, as `{ label, variant }`. An absent variant resolves to secondary. */
function buttons(src: string): { label: string; line: number; variant: string }[] {
	const found: { label: string; line: number; variant: string }[] = [];
	for (const match of src.matchAll(/<Button\b/g)) {
		const tag = openingTag(src, match.index);
		const close = src.indexOf('</Button>', match.index + tag.length);
		const inner = close === -1 ? '' : src.slice(match.index + tag.length, close);
		const variant = /variant="([a-z]+)"/.exec(tag);
		found.push({
			label: inner
				.replaceAll(/<[^>]*>/g, ' ')
				.replaceAll(/\{[^}]*\}/g, ' ')
				.replaceAll(/\s+/g, ' ')
				.trim()
				.toLowerCase(),
			line: src.slice(0, match.index).split('\n').length,
			variant: variant?.[1] ?? 'secondary',
		});
	}
	return found;
}

// The roles whose variant is settled app-wide, and what they settle to. These are the labels the
// desktop sweep found rendering two ways on two surfaces; the rule is written out in button.tsx and
// this is the half of it a test can hold. A label that legitimately carries two roles — `Reset
// filters`, `Discard` — is deliberately absent: pinning it here would force one of its two correct
// renderings to be wrong.
const SETTLED: Record<string, string> = {
	approve: 'secondary',
	cancel: 'secondary',
	retry: 'secondary',
};

const ROLE_EXCEPTIONS = new Set(['pages/projects/detail/HistoryDiaryState.tsx:retry']);

describe('button variants follow the action role', () => {
	test('names every role and its variant in the component docstring', async () => {
		const button = await source('components/ui/button.tsx');

		// The record asked for the rule to be written down, because the failure mode is an author
		// copying the nearest button rather than consulting anything.
		expect(button).toContain('Variants are chosen by the role an action plays');
		for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
			expect(button).toContain(`\`${variant}\``);
		}
		expect(button).toContain('dangerRowActionClass');
	});

	test('resolves a settled role to one variant across every surface', async () => {
		const offenders: string[] = [];
		let examined = 0;
		for await (const file of new Bun.Glob('**/*.tsx').scan({ cwd: FRONTEND_SRC })) {
			const path = file.replaceAll('\\', '/');
			const src = await source(file);
			if (!src.includes('<Button')) continue;
			for (const button of buttons(src)) {
				const expected = SETTLED[button.label];
				if (expected === undefined) continue;
				if (ROLE_EXCEPTIONS.has(`${path}:${button.label}`)) continue;
				examined += 1;
				if (button.variant !== expected) {
					offenders.push(
						`${path}:${button.line} ${button.label} is ${button.variant}, not ${expected}`,
					);
				}
			}
		}

		// The audit that produced SETTLED counted 26 such buttons. Pinned so that a parser which
		// quietly stops matching tags fails here rather than passing an empty census.
		expect(examined).toBeGreaterThan(20);
		expect(offenders).toEqual([]);
	});

	test('keeps management operations as peers instead of inventing a tab primary', async () => {
		for (const file of [
			'pages/projects/detail/MoveProjectCard.tsx',
			'pages/projects/detail/ReintakeCard.tsx',
			'pages/projects/detail/RenameProjectCard.tsx',
		]) {
			const card = await source(file);
			expect(card).toContain('variant="secondary"');
			expect(card).not.toContain('variant="primary"');
		}

		const deleteCard = await source('pages/projects/detail/DeleteProjectCard.tsx');
		expect(deleteCard).toContain('variant="danger"');
	});
});
