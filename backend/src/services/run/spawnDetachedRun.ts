import type { DetachedSpawnPayload } from 'aidd-shared/lib/detachedSpawn';
import type { CliActiveRunSource, RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { AiddRunDriver } from 'aidd-shared/run-provenance';

import { closeSync, openSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildDetachedRunSpawnPlan } from './detachedSpawnPlan.ts';
import { resolveDogfoodAppUrl, resolveTargetAppUrl } from './targetAppUrl.ts';

interface DetachedLaunchCommand {
	args: string[];
	launcherPrefix: string[];
}

interface SpawnDetachedRunInput {
	command: DetachedLaunchCommand;
	dataDir: string;
	driver?: AiddRunDriver;
	hostname: string;
	initiator: RunInitiator;
	logPath: string;
	port: number;
	projectDir: string;
	rootDir: string;
	runId: string;
	source: CliActiveRunSource;
}

interface SpawnedDetachedRun {
	/** The pid to persist, or null when the spawned process is not the run itself (Windows,
	 * where the spawned pwsh bridge exits as soon as it has handed off to the relauncher). */
	recordPid: null | number;
}

function normalizedPath(path: string): string {
	return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

export async function spawnDetachedRun(input: SpawnDetachedRunInput): Promise<SpawnedDetachedRun> {
	const payloadPath =
		process.platform === 'win32'
			? join(input.dataDir, 'run-logs', `${input.runId}.launch.json`)
			: null;
	if (payloadPath) {
		await writeFile(
			payloadPath,
			JSON.stringify({
				args: input.command.args,
				cwd: input.rootDir,
				logPath: input.logPath,
			} satisfies DetachedSpawnPayload),
		);
	}
	// Tell the agent where the app under test lives, so it verifies against the real address instead
	// of guessing framework defaults. Dogfooding is the special case: when the run targets the aidd
	// repo itself, the web panel that launched it IS the app, so hand over the live panel URL. Every
	// other project owns its own app on its own ports — the panel URL would mislead them, so resolve
	// the target project's configured frontend address instead. Null when neither applies: no launch
	// context is better than a wrong one.
	const isDogfoodRun = normalizedPath(input.projectDir) === normalizedPath(input.rootDir);
	const appUrl =
		isDogfoodRun && input.source === 'web'
			? resolveDogfoodAppUrl(input.hostname, input.port)
			: await resolveTargetAppUrl(input.projectDir);
	const spawnPlan = buildDetachedRunSpawnPlan({
		appUrl,
		args: input.command.args,
		...(input.driver ? { driver: input.driver } : {}),
		initiator: input.initiator,
		launcherPrefix: input.command.launcherPrefix,
		logPath: input.logPath,
		payloadPath,
		rootDir: input.rootDir,
		runId: input.runId,
		source: input.source,
	});
	const spawn = (): ReturnType<typeof Bun.spawn> => {
		if (spawnPlan.stderrLogPath === null) return Bun.spawn(spawnPlan.args, spawnPlan.options);
		const stderrFd = openSync(spawnPlan.stderrLogPath, 'a');
		try {
			return Bun.spawn(spawnPlan.args, { ...spawnPlan.options, stderr: stderrFd });
		} finally {
			// The child has inherited (duplicated) the fd; close our copy so the
			// long-lived web process does not leak a handle per launched run.
			closeSync(stderrFd);
		}
	};
	let childProcess: ReturnType<typeof Bun.spawn>;
	try {
		childProcess = spawn();
	} catch (err) {
		// Bun.spawn throws (rather than exiting non-zero) when the launcher binary is missing,
		// so this is the "nothing started" path. The caller rolls its ceiling reservation back;
		// clean up the one-shot payload here so the module that wrote it also removes it.
		if (payloadPath) await rm(payloadPath, { force: true }).catch(() => {});
		throw err;
	}
	childProcess.unref?.();
	return { recordPid: spawnPlan.recordPid === null ? null : childProcess.pid };
}
