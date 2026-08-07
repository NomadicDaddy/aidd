import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runDocs } from '../../scripts/check-docs.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

import { testTempDir } from '../_helpers/temp.ts';

function capture(fn: () => number): { exitCode: number; output: string } {
	const originalError = console.error;
	const originalLog = console.log;
	let buffer = '';
	const collect = (...args: unknown[]) => {
		buffer += `${args.join(' ')}\n`;
	};
	console.error = collect;
	console.log = collect;
	try {
		return { exitCode: fn(), output: buffer };
	} finally {
		console.error = originalError;
		console.log = originalLog;
	}
}

/** A scratch repository with one markdown file, so the gate has something real to examine. */
async function docTree(prefix: string, body: string): Promise<string> {
	const tmp = await testTempDir(prefix);
	await mkdir(join(tmp, 'docs'), { recursive: true });
	await writeFile(join(tmp, 'docs', 'page.md'), body);
	return tmp;
}

describe('check-docs tool', () => {
	test('passes against the current repository', () => {
		const { exitCode } = capture(() => runDocs(process.cwd()));
		expect(exitCode).toBe(0);
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:docs');
	});

	test('reports a link whose target does not exist', async () => {
		const tmp = await docTree('aidd-docs-broken-', 'See [the plan](./nowhere.md).\n');
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('./nowhere.md');
			expect(output).toContain('docs/page.md');
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});

	/**
	 * The waiver form this gate offers, exercised end to end. `licenses/SOURCE-OFFER.md` is the real
	 * case: it links to `SOURCE-MANIFEST.md`, which `scripts/package-release.ts` generates into each
	 * release archive and which is deliberately absent from a checkout.
	 */
	test('honors a marker that carries a reason', async () => {
		const tmp = await docTree(
			'aidd-docs-waived-',
			'See [the manifest](./gen.md). <!-- check-docs-allow: written at package time -->\n',
		);
		try {
			const { exitCode } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});

	test('accepts a marker on the line above the link', async () => {
		const tmp = await docTree(
			'aidd-docs-waived-above-',
			'<!-- check-docs-allow: written at package time -->\nSee [the manifest](./gen.md).\n',
		);
		try {
			const { exitCode } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});

	/**
	 * The two ways a marker stops being a waiver. Neither has a static form, so
	 * `check:gate-conventions` cannot reach either -- a waiver design is recognizable only by
	 * reading it, which makes these the only evidence that the design is the one it claims to be.
	 */
	test('refuses a marker with no reason rather than honoring it', async () => {
		const tmp = await docTree(
			'aidd-docs-reasonless-',
			'See [the manifest](./gen.md). <!-- check-docs-allow: -->\n',
		);
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('carries no reason');
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});

	test('reports a marker that no longer suppresses anything', async () => {
		const tmp = await docTree(
			'aidd-docs-stale-',
			'See [this page](./page.md). <!-- check-docs-allow: it used to be generated -->\n',
		);
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('no longer suppresses anything');
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});

	/**
	 * A pass over zero files is a pass earned by looking at nothing. This gate is delivered by
	 * `sync-shared-core.ts` into repositories whose layout it does not know in advance, so an
	 * exclusion that matched too much would otherwise read as clean documentation.
	 */
	test('fails rather than passing when no markdown file exists', async () => {
		const tmp = await testTempDir('aidd-docs-empty-');
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('No markdown files were found');
		} finally {
			await rm(tmp, { force: true, recursive: true });
		}
	});
});
