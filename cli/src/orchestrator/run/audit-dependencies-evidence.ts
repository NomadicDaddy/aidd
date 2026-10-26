import { scrubSecrets, StreamingSecretScrubber } from 'aidd-shared/lib/secretScrubber';
import { auditSetupPaths } from 'aidd-shared/metadata/audit-setup';
import { type FileHandle, mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuditGitSnapshot } from './audit-dependencies-git.ts';

export interface AuditInstallResult {
	cleanupComplete: boolean;
	error?: string;
	exitCode: null | number;
	pid?: number;
	signal?: string;
	status: 'complete' | 'failed' | 'stopped' | 'timeout';
	survivors?: number[];
}

export interface AuditSetupEvidence {
	command: string[];
	cwd: string;
	deadlineAtMs?: number;
	gitAfter?: AuditGitSnapshot;
	gitBefore?: AuditGitSnapshot;
	installTimeoutMs?: number;
	recordPath: string;
	runStartedAtMs?: number;
	startedAt: string;
	stderrPath: string;
	stdoutPath: string;
}

/** Preserve the full transcript except secret redaction. Each stream has its own decoder and
 * scrubber, so split UTF-8 and split secret tokens are handled before any bytes reach disk. */
export class AuditSetupOutput {
	private readonly handle: FileHandle;
	private readonly decoder = new TextDecoder();
	private readonly scrubber = new StreamingSecretScrubber();
	private writes: Promise<void> = Promise.resolve();

	constructor(handle: FileHandle) {
		this.handle = handle;
	}

	write(chunk: Uint8Array): void {
		this.enqueue(this.scrubber.write(this.decoder.decode(chunk, { stream: true })));
	}

	async close(): Promise<void> {
		this.enqueue(this.scrubber.write(this.decoder.decode()) + this.scrubber.flush());
		try {
			await this.writes;
		} finally {
			await this.handle.close();
		}
	}

	private enqueue(text: string): void {
		if (text.length === 0) return;
		this.writes = this.writes.then(async () => {
			await this.handle.write(text);
		});
	}
}

export async function openAuditSetupOutput(file: string): Promise<AuditSetupOutput> {
	return new AuditSetupOutput(await open(file, 'wx'));
}

export async function createAuditSetupEvidence(
	projectDir: string,
	runId: string,
	cwd: string,
): Promise<AuditSetupEvidence> {
	const directory = join(projectDir, '.aidd', 'reports', 'audit-setup');
	await mkdir(directory, { recursive: true });
	return {
		...auditSetupPaths(projectDir, runId),
		command: [process.execPath, 'install', '--frozen-lockfile', '--backend=copyfile'],
		cwd,
		startedAt: new Date().toISOString(),
	};
}

export async function writeAuditSetupEvidence(
	evidence: AuditSetupEvidence,
	result?: AuditInstallResult,
): Promise<void> {
	const record = {
		...evidence,
		...(result ? { ...result, endedAt: new Date().toISOString() } : { status: 'installing' }),
		...(result?.error ? { error: scrubSecrets(result.error) } : {}),
	};
	await writeFile(evidence.recordPath, `${JSON.stringify(record, null, 2)}\n`);
}
