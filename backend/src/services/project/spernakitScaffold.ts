import { join } from 'node:path';

import type { RecordInitFailure } from './templateScaffold.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import {
	formatInitFailureDetail,
	persistSpernakitInitLog,
	quarantineFailedInit,
	runTemplateInit,
	type SpawnOutcome,
} from './spernakitInit.ts';

// Lowercase, dash-only slug for init.ts's --application (its slug rule is stricter than aidd's
// project-name rule, which allows uppercase/underscores/periods).
function toSpernakitSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

// Run the portable Spernakit generator (scripts/init.ts) from a resolved checkout to scaffold, brand,
// and git-init the app at targetPath. aidd allocates the ports and passes them; init.ts writes the
// entry into the checkout's spernakit.psd1 so the fleet manifest stays in sync. Failure handling
// mirrors runTemplateScaffold: persist a log, quarantine partial output, record the init failure.
export async function runSpernakitInit(
	dataDir: string,
	checkoutDir: string,
	args: {
		backendPort: number;
		description: string;
		fleetManifest: null | string;
		frontendPort: number;
		name: string;
		root: string;
		targetPath: string;
	},
	recordInitFailure?: RecordInitFailure,
): Promise<void> {
	const { name, root, targetPath } = args;
	const slug = toSpernakitSlug(name);
	if (slug.length === 0) {
		throw new HttpError(`Project name "${name}" has no valid Spernakit slug characters`, 400);
	}
	// No --force: createProject already verified targetPath is empty/missing, so the generator must
	// not be licensed to recursively delete a populated target (that would turn a race into a wipe).
	const command = [
		'bun',
		join(checkoutDir, 'scripts', 'init.ts'),
		'--application',
		slug,
		'--target',
		targetPath,
		'--name',
		name,
		'--description',
		args.description || name,
		'--frontend-port',
		String(args.frontendPort),
		'--backend-port',
		String(args.backendPort),
		'--version',
		'0.1.0',
		'--manifest',
		args.fleetManifest ?? join(checkoutDir, 'spernakit.psd1'),
	];
	const recordFailure = async (
		errorSummary: string,
		logPath: null | string,
		quarantinePath: null | string,
	): Promise<void> => {
		if (recordInitFailure) {
			await recordInitFailure({
				description: args.description || null,
				errorSummary,
				logPath,
				name,
				quarantinePath,
				root,
				targetPath,
				template: 'spernakit',
				templateUrl: null,
			});
		}
	};
	const timestamp = Date.now();
	let outcome: SpawnOutcome;
	try {
		outcome = await runTemplateInit(command, checkoutDir);
	} catch (err) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		const summary = `Spernakit init could not be executed: ${
			err instanceof Error ? err.message : String(err)
		}`;
		await recordFailure(summary, null, quarantinePath);
		throw new HttpError(
			`${summary}${quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''}`,
			500,
		);
	}
	const logPath = await persistSpernakitInitLog(dataDir, outcome, timestamp);
	if (outcome.code !== 0) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		await recordFailure(
			`Spernakit init failed with exit code ${outcome.code}.\n${formatInitFailureDetail(outcome)}`,
			logPath,
			quarantinePath,
		);
		throw new HttpError(
			`Spernakit init failed with exit code ${outcome.code}. Full output: ${logPath}${
				quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''
			}\n${formatInitFailureDetail(outcome)}`,
			500,
		);
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.create.spernakit',
		status: 'success',
		summary: { name, root, slug },
		target: targetPath,
	});
}
