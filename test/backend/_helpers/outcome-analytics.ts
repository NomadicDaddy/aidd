import { Database } from 'bun:sqlite';
import type { FindingLedgerEvent } from '../../../shared/src/metadata/findings-ledger.ts';
import { wrapWebDatabase } from '../../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../../backend/src/db/migrate.ts';

export const fingerprintA = `f1-${'a'.repeat(64)}`;
export const fingerprintB = `f1-${'b'.repeat(64)}`;

export function outcomeDatabase() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

export function findingEvent(
	kind: FindingLedgerEvent['event'],
	featureId: string,
	fingerprint: string,
	extra: Partial<FindingLedgerEvent> = {},
): FindingLedgerEvent {
	return {
		at: '2026-08-25T12:00:00.000Z',
		auditSource: 'SECURITY',
		event: kind,
		featureId,
		fingerprint,
		runId: 'run-audit',
		...extra,
	};
}

export function git(cwd: string, args: string[]): void {
	const result = Bun.spawnSync(
		['git', '-c', 'user.email=test@example.invalid', '-c', 'user.name=aidd-test', ...args],
		{ cwd, stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

export function gitHead(cwd: string): string {
	return Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd, stdout: 'pipe', windowsHide: true })
		.stdout.toString()
		.trim();
}
