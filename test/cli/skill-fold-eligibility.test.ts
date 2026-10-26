import { describe, expect, spyOn, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readSkillDefinition } from 'aidd-shared/skills/catalog';

import {
	copySkillContracts,
	skillContractDeps,
} from '../../cli/src/metadata/scaffoldSkillContracts.ts';
import {
	assessFoldSource,
	checkFoldSource,
	main,
} from '../../skills/consolidate-features/scripts/check-fold-eligibility.ts';
import { testTempDir } from '../_helpers/temp.ts';

function sourceBytes(overrides: Record<string, unknown> = {}): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			completedAt: '2026-10-26T15:37:07.692Z',
			id: 'remediation-fixture',
			notes: ['Existing review history'],
			passes: true,
			spec: '1. Preserve exact product matching\n2. Keep unrelated processes unkillable',
			status: 'completed',
			...overrides,
		}),
	);
}

describe('finding fold eligibility', () => {
	test('accepts only an unchanged completed and passing source', () => {
		const bytes = sourceBytes();
		const first = assessFoldSource(bytes);
		expect(first.eligible).toBe(true);
		expect(first.reason).toBe('eligible');
		expect(assessFoldSource(bytes, first.sha256.toUpperCase())).toEqual(first);
		expect(assessFoldSource(sourceBytes({ passes: false })).reason).toBe('not-passing');
		expect(assessFoldSource(sourceBytes({ passes: 'true' })).eligible).toBe(false);
	});

	test('rejects the archived-open case even when owner criteria and completedAt match', () => {
		const archived = sourceBytes({
			notes: ['Reopened: High finding remains'],
			passes: false,
			status: 'backlog',
		});
		const owner = JSON.parse(new TextDecoder().decode(sourceBytes())) as { spec: string };
		const child = JSON.parse(new TextDecoder().decode(archived)) as { spec: string };
		// Positive control for the old final check: equal criteria missed the reopened state.
		expect(child.spec).toBe(owner.spec);
		const result = assessFoldSource(archived);
		expect(result.eligible).toBe(false);
		expect(result.reason).toBe('not-completed');
		for (const status of ['backlog', 'in_progress', 'waiting_approval', 'deferred']) {
			expect(assessFoldSource(sourceBytes({ status })).eligible).toBe(false);
		}
	});

	test('refuses changed notes or bytes without silently adopting a new snapshot', async () => {
		const dir = await testTempDir('fold-source-change-');
		const path = join(dir, 'feature.json');
		const bytes = sourceBytes();
		await writeFile(path, bytes);
		const initial = await checkFoldSource(path);
		const changed = sourceBytes({
			notes: ['Existing review history', 'Owner says review is open'],
		});
		await writeFile(path, changed);
		expect((await checkFoldSource(path, initial.sha256)).reason).toBe('source-changed');
		expect(await readFile(path)).toEqual(Buffer.from(changed));
	});

	test('fails closed on malformed data, invalid snapshots and unreadable paths', async () => {
		expect(() => assessFoldSource(new TextEncoder().encode('{'))).toThrow('valid UTF-8 JSON');
		expect(() => assessFoldSource(new Uint8Array([0xff]))).toThrow('valid UTF-8 JSON');
		expect(() => assessFoldSource(new TextEncoder().encode('[]'))).toThrow(
			'feature JSON object',
		);
		expect(() => assessFoldSource(sourceBytes(), 'not-a-hash')).toThrow('64 hexadecimal');
		expect(assessFoldSource(sourceBytes({ id: '' })).eligible).toBe(false);
		const dir = await testTempDir('fold-source-invalid-');
		await expect(checkFoldSource(join(dir, 'missing.json'))).rejects.toThrow();
		await expect(checkFoldSource(dir)).rejects.toThrow('regular file');
		const error = spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			expect(await main(['--source', dir])).toBe(1);
			expect(await main([])).toBe(1);
		} finally {
			error.mockRestore();
		}
	});

	test('returns failure on an injected read denial without changing the source', async () => {
		const dir = await testTempDir('fold-source-denied-');
		const source = join(dir, 'feature.json');
		const bytes = sourceBytes();
		await writeFile(source, bytes);
		const fs = await import('node:fs/promises');
		const read = spyOn(fs, 'readFile').mockRejectedValue(
			Object.assign(new Error('Fixture read denied'), { code: 'EACCES' }),
		);
		const error = spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			await expect(checkFoldSource(source)).rejects.toMatchObject({ code: 'EACCES' });
			expect(await main(['--snapshot', '--source', source])).toBe(1);
		} finally {
			read.mockRestore();
			error.mockRestore();
		}
		expect(await readFile(source)).toEqual(Buffer.from(bytes));
	});

	test('stages a runnable guard that accepts a baseline and refuses its reopened source', async () => {
		const dir = await testTempDir('fold-source-staged-');
		const metadata = join(dir, '.aidd');
		const root = resolve(import.meta.dir, '../..');
		const skill = await readSkillDefinition(root, 'consolidate-features');
		const deps = skillContractDeps(skill);
		expect(deps?.contracts).toContain('consolidate-features');
		await copySkillContracts(deps, root, metadata, undefined, undefined);
		const source = join(metadata, 'features/remediation-fixture/feature.json');
		await mkdir(join(metadata, 'features/remediation-fixture'), { recursive: true });
		const run = async (extra: string[] = []) => {
			const child = Bun.spawn(
				[
					process.execPath,
					join(metadata, 'skills/consolidate-features/scripts/check-fold-eligibility.ts'),
					'--source',
					source,
					...extra,
				],
				{ cwd: dir, stdout: 'pipe', stderr: 'pipe', windowsHide: true },
			);
			return Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			] as const);
		};
		await writeFile(source, sourceBytes());
		const [accepted, errors, code] = await run(['--snapshot']);
		expect(code).toBe(0);
		expect(errors).toBe('');
		const snapshot = JSON.parse(accepted) as { eligible: boolean; sha256: string };
		expect(snapshot.eligible).toBe(true);
		const [, missingHashError, missingHashCode] = await run();
		expect(missingHashCode).toBe(1);
		expect(missingHashError).toContain('invalid arguments');
		const bytes = sourceBytes({ passes: false, status: 'backlog' });
		await writeFile(source, bytes);
		const [stdout, stderr, exit] = await run(['--expect-sha256', snapshot.sha256]);
		expect(exit).toBe(1);
		expect(stderr).toBe('');
		expect(JSON.parse(stdout)).toMatchObject({
			eligible: false,
			mode: 'verification',
			reason: 'source-changed',
		});
		expect(await readFile(source)).toEqual(Buffer.from(bytes));
	});
});
