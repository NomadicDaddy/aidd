import { describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runDocs } from '../../scripts/check-docs.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

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

/** The same tree, in a repository whose gitignore hides the file the link points at. */
async function ignoredTargetTree(prefix: string, body: string): Promise<string> {
	const tmp = await docTree(prefix, body);
	await writeFile(
		join(tmp, 'docs', 'examples.md'),
		'Present here, absent from the repository.\n',
	);
	await writeFile(join(tmp, '.gitignore'), 'docs/examples.md\n');
	Bun.spawnSync(['git', 'init'], {
		cwd: tmp,
		stderr: 'ignore',
		stdout: 'ignore',
		windowsHide: true,
	});
	return tmp;
}

function isVariationSelector(character: string): boolean {
	const codePoint = character.codePointAt(0);
	return (
		codePoint !== undefined &&
		((codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
			(codePoint >= 0xe0100 && codePoint <= 0xe01ef))
	);
}

async function orphanAuditFragmentSelectors(projectRoot: string): Promise<string[]> {
	const auditDir = join(projectRoot, 'audits');
	const auditFiles = (await readdir(auditDir)).filter((file) => file.endsWith('.md'));
	const violations: string[] = [];

	for (const file of auditFiles) {
		const content = await readFile(join(auditDir, file), 'utf8');
		for (const link of content.matchAll(/\]\([^)]*#([^)]*)\)/g)) {
			const fragment = link[1]!;
			const characters = [...fragment];
			for (let index = 0; index < characters.length; index++) {
				if (!isVariationSelector(characters[index]!)) continue;
				if (index > 0 && /\p{Emoji}/u.test(characters[index - 1]!)) continue;
				violations.push(`${file}: #${fragment}`);
			}
		}
	}

	return violations;
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

	test('audit fragments have no orphan selectors and the CONVEX quick-reference link resolves', async () => {
		const projectRoot = process.cwd();
		expect(await orphanAuditFragmentSelectors(projectRoot)).toEqual([]);

		const convex = await readFile(join(projectRoot, 'audits', 'CONVEX.md'), 'utf8');
		const heading = 'Quick Reference - Mandatory Rules';
		expect(convex).toContain(`## ${heading}`);
		expect(convex).toContain(`[${heading}](#${heading.toLowerCase().replaceAll(' ', '-')})`);
	});

	test('reports a variation selector attached to fragment punctuation', async () => {
		const tmp = await testTempDir('aidd-docs-selector-');
		const orphanSelector = String.fromCodePoint(0xfe0f);
		try {
			await mkdir(join(tmp, 'audits'), { recursive: true });
			await writeFile(
				join(tmp, 'audits', 'EXAMPLE.md'),
				`[Target](#target-${orphanSelector})\n`,
			);
			expect(await orphanAuditFragmentSelectors(tmp)).toEqual([
				`EXAMPLE.md: #target-${orphanSelector}`,
			]);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('reports a link whose target does not exist', async () => {
		const tmp = await docTree('aidd-docs-broken-', 'See [the plan](./nowhere.md).\n');
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('./nowhere.md');
			expect(output).toContain('docs/page.md');
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * The failure this rule exists for. `check:docs` reads the working tree, so a link to a
	 * gitignored file resolves for the person who wrote it and for nobody else: CI clones a fresh
	 * tree, and the target is not in it. Caught in v3.0.2 by CI rather than by the local gate.
	 */
	test('reports a link whose target exists but is gitignored', async () => {
		const tmp = await ignoredTargetTree(
			'aidd-docs-ignored-',
			'See [the examples](./examples.md).\n',
		);
		try {
			const { exitCode, output } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('./examples.md');
			expect(output).toContain('git ignores it');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('honors a marker on a link whose target is gitignored', async () => {
		const tmp = await ignoredTargetTree(
			'aidd-docs-ignored-waived-',
			'See [the examples](./examples.md). <!-- check-docs-allow: staged into the workspace -->\n',
		);
		try {
			const { exitCode } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	/** The waiver form this gate offers, exercised end to end. */
	test('honors a marker that carries a reason', async () => {
		const tmp = await docTree(
			'aidd-docs-waived-',
			'See [the panel](./missing.md). <!-- check-docs-allow: runtime route -->\n',
		);
		try {
			const { exitCode } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('accepts a marker on the line above the link', async () => {
		const tmp = await docTree(
			'aidd-docs-waived-above-',
			'<!-- check-docs-allow: runtime route -->\nSee [the panel](./missing.md).\n',
		);
		try {
			const { exitCode } = capture(() => runDocs(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
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
			await removeTempTree(tmp);
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
			await removeTempTree(tmp);
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
			await removeTempTree(tmp);
		}
	});
});
