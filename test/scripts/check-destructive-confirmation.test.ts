import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runDestructiveConfirmation } from '../../scripts/check-destructive-confirmation.ts';
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

/** A scratch repository with one component, so the gate has something real to examine. */
async function componentTree(prefix: string, body: string): Promise<string> {
	const tmp = await testTempDir(prefix);
	await mkdir(join(tmp, 'frontend', 'src', 'pages'), { recursive: true });
	await writeFile(join(tmp, 'frontend', 'src', 'pages', 'Thing.tsx'), body);
	return tmp;
}

describe('check-destructive-confirmation tool', () => {
	test('passes against the current repository', () => {
		const { exitCode, output } = capture(() => runDestructiveConfirmation(process.cwd()));
		expect(exitCode).toBe(0);
		expect(output).toContain('destructive call site(s) examined');
	});

	test('is wired into smoke:qc steps', () => {
		const stepNames = SMOKE_QC_STEPS.map((step) => step.name);
		expect(stepNames).toContain('check:destructive-confirmation');
	});

	test('skips a project with no frontend source directory', async () => {
		const tmp = await testTempDir('aidd-destructive-nofrontend-');
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(0);
			expect(output).toContain('[SKIP]');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('reports a destructive dispatch with no confirmation anywhere', async () => {
		const tmp = await componentTree(
			'aidd-destructive-bare-',
			[
				'export function Thing() {',
				'\tconst deleteThing = useDeleteThing();',
				'\treturn <button onClick={() => deleteThing.mutate(id)}>Delete</button>;',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('frontend/src/pages/Thing.tsx:3');
			expect(output).toContain(
				'1 destructive call site(s) with no confirmation, of 1 examined',
			);
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * The evidence form the rewrite added. Both carriers dispatch from a handler at the top of the
	 * component and wire it to a dialog at the bottom, far outside the fifteen-line window that was
	 * the only admissible evidence before. Six of the thirteen real call sites are this shape.
	 */
	test('accepts confirmation that names the handler holding the dispatch', async () => {
		const tmp = await componentTree(
			'aidd-destructive-handler-',
			[
				'export function Thing() {',
				'\tconst deleteThing = useDeleteThing();',
				'',
				'\tfunction handleDelete() {',
				'\t\tdeleteThing.mutate(id);',
				'\t}',
				...Array.from({ length: 30 }, (_, i) => `\t// filler ${i}`),
				'\treturn <ConfirmDialog onConfirm={handleDelete} />;',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * The hop is one level deep on purpose. A dispatcher a confirm handler reaches usually has other
	 * callers, and marking it confirmed because one of them confirms is the laundering the gate
	 * exists to prevent.
	 */
	test('does not follow a second hop through a shared dispatcher', async () => {
		const tmp = await componentTree(
			'aidd-destructive-twohop-',
			[
				'export function Thing() {',
				'\tfunction apply() {',
				'\t\tdeleteThing.mutate(id);',
				'\t}',
				...Array.from({ length: 30 }, (_, i) => `\t// filler ${i}`),
				'\tfunction confirmIt() {',
				'\t\tapply();',
				'\t}',
				'\treturn <ConfirmDialog onConfirm={confirmIt} />;',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(1);
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * Rule 5 of the gate conventions, in the state this gate actually spent releases in: its patterns
	 * matched nothing in a frontend full of destructive dispatches, and it reported a pass every run.
	 */
	test('fails when a frontend has mutations but no destructive call site', async () => {
		const tmp = await componentTree(
			'aidd-destructive-vacuous-',
			[
				'export function Thing() {',
				'\tconst save = useMutation();',
				'\treturn null;',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('No destructive call sites found');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('skips a frontend with no mutation layer at all', async () => {
		const tmp = await componentTree(
			'aidd-destructive-nomutations-',
			['export function Thing() {', '\treturn <p>static</p>;', '}'].join('\n'),
		);
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(0);
			expect(output).toContain('[SKIP]');
		} finally {
			await removeTempTree(tmp);
		}
	});

	/**
	 * The waiver form, exercised end to end. aidd's `DeleteProjectCard.tsx` is the real case: the
	 * operator types the project's full path before the submit button enables, which is a stronger
	 * gate than a dialog and matches none of the confirmation primitives, because it is not one.
	 */
	test('honors a marker that carries a reason', async () => {
		const tmp = await componentTree(
			'aidd-destructive-waived-',
			[
				'export function Thing() {',
				'\t// destructive-confirmation-allow: typed-path field gates the submit button',
				'\tdeleteThing.mutate(id);',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('honors a marker written above the call in a multi-line comment block', async () => {
		const tmp = await componentTree(
			'aidd-destructive-block-',
			[
				'export function Thing() {',
				'\t// destructive-confirmation-allow: the plan dialog confirms every delete before',
				'\t// this path is reachable, which milestonePlanNeedsReview makes unconditional.',
				'\tdeleteThing.mutate(id);',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('refuses a marker with no reason', async () => {
		const tmp = await componentTree(
			'aidd-destructive-reasonless-',
			[
				'export function Thing() {',
				'\t// destructive-confirmation-allow:',
				'\tdeleteThing.mutate(id);',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('carries no reason');
		} finally {
			await removeTempTree(tmp);
		}
	});

	/** The list can only shrink: a marker over a call the gate can now see is a standing exemption. */
	test('refuses a marker that no longer suppresses anything', async () => {
		const tmp = await componentTree(
			'aidd-destructive-stale-',
			[
				'export function Thing() {',
				'\t// destructive-confirmation-allow: was unconfirmed once',
				'\treturn <ConfirmDialog onConfirm={() => deleteThing.mutate(id)} />;',
				'}',
			].join('\n'),
		);
		try {
			const { exitCode, output } = capture(() => runDestructiveConfirmation(tmp));
			expect(exitCode).toBe(1);
			expect(output).toContain('no longer suppresses anything');
		} finally {
			await removeTempTree(tmp);
		}
	});
});
