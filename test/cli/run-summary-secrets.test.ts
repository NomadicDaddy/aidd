import { afterEach, expect, test } from 'bun:test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-tests', 'run-summary-secrets');

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

// runs.jsonl is kept as run provenance, so a credential an agent quoted into its summary must not
// reach it the way it once reached the iteration transcripts.
test('redacts secrets from the run ledger and keeps the provenance fields', async () => {
	await mkdir(join(tmpRoot, '.aidd'), { recursive: true });
	const store = new FileAiddStore(tmpRoot);
	const token = `github_pat_${'A1b2C3d4E5'.repeat(4)}`;
	await store.appendRunSummary({
		backend: 'codex',
		filesEdited: ['backend/src/app.ts'],
		runId: 'run-1',
		summary: `Rotated the key; the old GITHUB_TOKEN=${token} is revoked.`,
		totals: { inputTokens: 1200, outputTokens: 300 },
	});

	const raw = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	expect(raw).not.toContain(token);
	const row = JSON.parse(raw) as {
		backend: string;
		filesEdited: string[];
		runId: string;
		summary: string;
		totals: { inputTokens: number; outputTokens: number };
	};
	expect(row.summary).toContain('[REDACTED]');
	expect(row.summary).toContain('is revoked');
	// Token counts are not credentials: the key matcher must leave them intact.
	expect(row.totals).toEqual({ inputTokens: 1200, outputTokens: 300 });
	expect(row.backend).toBe('codex');
	expect(row.runId).toBe('run-1');
	expect(row.filesEdited).toEqual(['backend/src/app.ts']);
});
