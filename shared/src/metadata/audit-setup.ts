import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function auditSetupPaths(projectDir: string, runId: string) {
	const stem = join(projectDir, '.aidd', 'reports', 'audit-setup', encodeURIComponent(runId));
	return {
		recordPath: `${stem}.json`,
		stderrPath: `${stem}.stderr.log`,
		stdoutPath: `${stem}.stdout.log`,
	};
}

/** A failed supervising process does not prove its installer children are gone. Retain setup
 * worktrees until the canonical runtime record positively confirms cleanup; malformed evidence
 * also fails closed. This prevents the web orphan sweeper undoing the CLI's retention decision. */
export async function auditSetupNeedsRetention(
	projectDir: string,
	runId: string,
	worktreeDir: string,
): Promise<boolean> {
	try {
		const record: unknown = JSON.parse(
			await readFile(auditSetupPaths(projectDir, runId).recordPath, 'utf8'),
		);
		if (typeof record !== 'object' || record === null) return true;
		const setup = record as Record<string, unknown>;
		if (typeof setup.cwd !== 'string' || resolve(setup.cwd) !== resolve(worktreeDir))
			return true;
		return setup.status === 'installing' || setup.cleanupComplete !== true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ENOENT';
	}
}
