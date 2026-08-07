import { describe, expect, test } from 'bun:test';

import { findEntryChunk, parseCriticalAssets } from '../../scripts/lib/critical-path/assets.ts';

describe('critical-path HTML discovery', () => {
	test('finds blocking assets regardless of attribute or tag casing', () => {
		const html = `
			<SCRIPT src="/assets/entry.js" TYPE="module"></SCRIPT>
			<link href="/assets/runtime.js" rel="modulepreload">
			<link rel="stylesheet" href="/assets/app.css">
			<link rel="prefetch" href="/assets/lazy.js">
		`;

		expect(parseCriticalAssets(html)).toEqual(['entry.js', 'runtime.js', 'app.css']);
	});

	test('deduplicates assets and excludes non-blocking links', () => {
		const html = `
			<script type="module" src="/assets/entry.js"></script>
			<link rel="modulepreload" href="/assets/entry.js">
			<link rel="preload" href="/assets/font.woff2">
			<script src="/assets/classic.js"></script>
		`;

		expect(parseCriticalAssets(html)).toEqual(['entry.js']);
	});

	test('identifies the module entry without assuming attribute order', () => {
		expect(findEntryChunk('<script src="/assets/entry.js" defer type="module"></script>')).toBe(
			'entry.js',
		);
		expect(findEntryChunk('<script src="/assets/classic.js"></script>')).toBeNull();
	});
});
