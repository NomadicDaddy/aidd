import { describe, expect, spyOn, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readSkillDefinition } from 'aidd-shared/skills/catalog';

import {
	copySkillContracts,
	skillContractDeps,
} from '../../cli/src/metadata/scaffoldSkillContracts.ts';
import {
	archiveFeature,
	listLongNotes,
	main,
	NOTES_TRIM_THRESHOLD,
	verifyTrim,
} from '../../skills/consolidate-features/scripts/trim-notes.ts';
import { testTempDir } from '../_helpers/temp.ts';

const LONG = 'h'.repeat(NOTES_TRIM_THRESHOLD + 1);

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		dependencies: ['schema'],
		description: 'Keeps the run list current',
		id: 'run-list',
		notes: [LONG],
		passes: true,
		spec: '1. List every run\n2. Never hide a failed run',
		status: 'completed',
		updatedAt: '2026-10-01T00:00:00.000Z',
		...overrides,
	};
}

async function writeFeature(root: string, directory: string, value: unknown): Promise<string> {
	const dir = join(root, directory);
	await mkdir(dir, { recursive: true });
	const path = join(dir, 'feature.json');
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`);
	return path;
}

const ORIGINALS = '.aidd/reports/consolidation/20261103-notes-trim/originals';
const LINK = `${ORIGINALS}/run-list.feature.json`;

async function archived(prefix: string) {
	const root = await testTempDir(prefix);
	const source = await writeFeature(join(root, '.aidd/features'), 'run-list', record());
	const original = await readFile(source);
	const result = await archiveFeature(source, join(root, ORIGINALS));
	return { original, result, root, source };
}

function trimmedNotes(sha256: string, link = LINK): string[] {
	return [
		`Notes trimmed 2026-11-03: history archived at ${link} (sha256 ${sha256}).`,
		'Current state: shipped; no open decision.',
	];
}

describe('notes trim helper', () => {
	test('lists records over the threshold, longest first, skipping unreadable ones', async () => {
		const root = await testTempDir('trim-list-');
		await writeFeature(root, 'short', record({ id: 'short', notes: ['ok'] }));
		await writeFeature(root, 'long', record({ id: 'long', status: 'backlog' }));
		await writeFeature(root, 'longer', record({ id: 'longer', notes: `${LONG}${LONG}` }));
		await mkdir(join(root, 'empty'));
		await writeFile(join(root, 'stray.txt'), 'not a feature');
		expect(await listLongNotes(root)).toEqual([
			{ chars: LONG.length * 2, directory: 'longer', status: 'completed' },
			{ chars: LONG.length, directory: 'long', status: 'backlog' },
		]);
	});

	test('archives the exact bytes once and refuses a different archive of the same name', async () => {
		const { original, result, root, source } = await archived('trim-archive-');
		expect(await readFile(result.archive)).toEqual(original);
		expect(result.chars).toBe(LONG.length);
		expect(await archiveFeature(source, join(root, ORIGINALS))).toEqual(result);
		await writeFile(source, JSON.stringify(record({ notes: ['changed'] })));
		await expect(archiveFeature(source, join(root, ORIGINALS))).rejects.toThrow(
			'different archive',
		);
		expect(await readFile(result.archive)).toEqual(original);
	});

	test('passes a trim that changes only notes and updatedAt and links the archive', async () => {
		const { result, source } = await archived('trim-verify-');
		const trimmed = record({
			notes: trimmedNotes(result.sha256),
			updatedAt: '2026-11-03T00:00:00.000Z',
		});
		await writeFile(source, JSON.stringify(trimmed));
		const check = await verifyTrim(source, result.archive, result.sha256.toUpperCase());
		expect(check).toMatchObject({ before: LONG.length, id: 'run-list', ok: true });
		expect(check.after).toBeLessThan(check.before);
	});

	test('refuses a trim that changes any other field, drops the link or saves nothing', async () => {
		const { result, source } = await archived('trim-refuse-');
		const notes = trimmedNotes(result.sha256);
		const cases: [Record<string, unknown>, string][] = [
			[record({ notes, spec: '1. List every run' }), 'field-changed:spec'],
			[record({ notes, status: 'backlog' }), 'field-changed:status'],
			[{ ...record({ notes }), summary: 'added' }, 'field-changed:summary'],
			[record({ notes: ['Current state: shipped.'] }), 'notes-missing-archive-link'],
			[record({ notes: notes.join(' ') }), 'notes-missing-archive-link'],
			[
				// Positive control for Roger's 4dddb529 Low: the same file name and hash under another
				// folder passed when only the name was matched.
				record({
					notes: trimmedNotes(
						result.sha256,
						'.aidd/reports/consolidation/WRONG/originals/run-list.feature.json',
					),
				}),
				'notes-missing-archive-link',
			],
			[record({ notes: [...notes, LONG] }), 'notes-not-shorter'],
		];
		for (const [value, reason] of cases) {
			await writeFile(source, JSON.stringify(value));
			expect(await verifyTrim(source, result.archive, result.sha256)).toMatchObject({
				ok: false,
				reason,
			});
		}
	});

	test('refuses an archive kept outside a .aidd folder, which no note can cite', async () => {
		const root = await testTempDir('trim-outside-');
		const source = await writeFeature(join(root, 'features'), 'run-list', record());
		const result = await archiveFeature(source, join(root, 'elsewhere'));
		await writeFile(source, JSON.stringify(record({ notes: trimmedNotes(result.sha256) })));
		expect((await verifyTrim(source, result.archive, result.sha256)).reason).toBe(
			'archive-outside-aidd',
		);
	});

	test('refuses when the archive no longer matches its recorded hash', async () => {
		const { result, source } = await archived('trim-archive-changed-');
		await writeFile(source, JSON.stringify(record({ notes: trimmedNotes(result.sha256) })));
		await writeFile(result.archive, JSON.stringify(record({ notes: ['edited archive'] })));
		expect((await verifyTrim(source, result.archive, result.sha256)).reason).toBe(
			'archive-changed',
		);
		await expect(verifyTrim(source, result.archive, 'not-a-hash')).rejects.toThrow(
			'64 hexadecimal',
		);
	});

	test('fails closed on bad arguments without printing file contents', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			expect(await main([])).toBe(1);
			expect(await main(['trim'])).toBe(1);
			expect(await main(['list'])).toBe(1);
			expect(await main(['list', '--features', 'x', '--threshold', '-1'])).toBe(1);
			expect(await main(['verify', '--source', 'missing.json'])).toBe(1);
		} finally {
			error.mockRestore();
		}
	});

	test('document-changes stages the helper its pre-push trim step runs', async () => {
		const dir = await testTempDir('trim-document-changes-');
		const metadata = join(dir, '.aidd');
		const root = resolve(import.meta.dir, '../..');
		const deps = skillContractDeps(await readSkillDefinition(root, 'document-changes'));
		expect(deps?.contracts).toContain('consolidate-features');
		await copySkillContracts(deps, root, metadata, undefined, undefined);
		const staged = join(metadata, 'skills/consolidate-features/scripts/trim-notes.ts');
		const source = join(root, 'skills/consolidate-features/scripts/trim-notes.ts');
		expect(await readFile(staged)).toEqual(await readFile(source));
	});

	test('stages a runnable helper with the consolidate-features contract', async () => {
		const dir = await testTempDir('trim-staged-');
		const metadata = join(dir, '.aidd');
		const root = resolve(import.meta.dir, '../..');
		const deps = skillContractDeps(await readSkillDefinition(root, 'consolidate-features'));
		await copySkillContracts(deps, root, metadata, undefined, undefined);
		await writeFeature(join(metadata, 'features'), 'run-list', record());
		const child = Bun.spawn(
			[
				process.execPath,
				join(metadata, 'skills/consolidate-features/scripts/trim-notes.ts'),
				'list',
				'--features',
				join(metadata, 'features'),
			],
			{ cwd: dir, stderr: 'pipe', stdout: 'pipe', windowsHide: true },
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		] as const);
		expect(stderr).toBe('');
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toEqual({
			mode: 'list',
			records: [{ chars: LONG.length, directory: 'run-list', status: 'completed' }],
			threshold: NOTES_TRIM_THRESHOLD,
		});
	});
});
