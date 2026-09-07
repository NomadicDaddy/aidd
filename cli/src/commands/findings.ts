import {
	findingDismissalReasons,
	isFindingDismissalReason,
} from 'aidd-shared/contracts/finding-dispositions';
import {
	describeRecordedDismissal,
	dismissFinding,
	FindingDismissalRefusedError,
} from 'aidd-shared/metadata/finding-dismissal';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { resolve } from 'node:path';

const USAGE = `Usage: aidd findings dismiss --project-dir <dir> --feature <id> --reason <reason> [--note <text>]

Dismiss a fingerprinted audit finding: records one dismissed event in
.aidd/findings-ledger.jsonl (the store stamps the timestamp and source), then removes
.aidd/features/<id>/ and its roadmap entry. Only backlog or waiting_approval findings
can be dismissed.

Reasons: ${findingDismissalReasons.join(', ')}

Exit codes: 0 dismissed, 1 the feature is not a dismissable finding (or removal failed
after the event was recorded), 2 usage error.`;

function printUsage(): void {
	console.error(USAGE);
}

interface DismissOptions {
	feature: string;
	note?: string;
	projectDir: string;
	reason: string;
}

function parseDismissArgs(argv: string[]): DismissOptions | number {
	let projectDir: null | string = null;
	let feature: null | string = null;
	let reason: null | string = null;
	let note: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? '';
		if (arg === '--help' || arg === '-h') {
			console.log(USAGE);
			return 0;
		}
		if (
			arg === '--project-dir' ||
			arg === '--feature' ||
			arg === '--reason' ||
			arg === '--note'
		) {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith('--')) {
				console.error(`Missing value for ${arg}`);
				return 2;
			}
			if (arg === '--project-dir') projectDir = value;
			else if (arg === '--feature') feature = value;
			else if (arg === '--reason') reason = value;
			else note = value;
			i++;
			continue;
		}
		console.error(`Unknown argument for aidd findings dismiss: ${arg}`);
		printUsage();
		return 2;
	}
	if (projectDir === null || feature === null || reason === null) {
		const missing = [
			projectDir === null ? '--project-dir' : null,
			feature === null ? '--feature' : null,
			reason === null ? '--reason' : null,
		].filter((flag): flag is string => flag !== null);
		console.error(`Missing required option(s): ${missing.join(', ')}`);
		printUsage();
		return 2;
	}
	return { feature, ...(note !== undefined ? { note } : {}), projectDir, reason };
}

/** `aidd findings <subcommand>`. Returns the process exit code. */
export async function runFindingsCommand(argv: string[]): Promise<number> {
	const subcommand = argv[0];
	if (subcommand === undefined || subcommand === '--help' || subcommand === '-h') {
		console.log(USAGE);
		return subcommand === undefined ? 2 : 0;
	}
	if (subcommand !== 'dismiss') {
		console.error(`Unknown findings subcommand: ${subcommand}`);
		printUsage();
		return 2;
	}
	const parsed = parseDismissArgs(argv.slice(1));
	if (typeof parsed === 'number') return parsed;
	if (!isFindingDismissalReason(parsed.reason)) {
		console.error(
			`Unknown dismissal reason '${parsed.reason}'. Expected one of: ${findingDismissalReasons.join(', ')}`,
		);
		return 2;
	}

	const projectDir = resolve(parsed.projectDir);
	const store = new FileAiddStore(projectDir);
	let feature;
	try {
		feature = await store.readFeature(parsed.feature);
	} catch {
		console.error(`Feature not found: ${parsed.feature} (under ${store.metadataDir}/features)`);
		return 1;
	}

	let outcome;
	try {
		outcome = await dismissFinding(store, feature, parsed.feature, {
			...(parsed.note !== undefined ? { note: parsed.note } : {}),
			reason: parsed.reason,
			source: 'cli',
		});
	} catch (err) {
		if (err instanceof FindingDismissalRefusedError) {
			console.error(`Cannot dismiss ${parsed.feature}: ${err.message}`);
			return 1;
		}
		throw err;
	}
	if (outcome.removalError !== undefined) {
		const detail =
			outcome.removalError instanceof Error
				? outcome.removalError.message
				: String(outcome.removalError);
		console.error(
			`Recorded ${describeRecordedDismissal(outcome.event)} but could not remove the feature directory: ${detail}. Re-run the same command to retry the removal; the event will not be duplicated.`,
		);
		return 1;
	}
	console.log(
		`Dismissed ${parsed.feature} (${parsed.reason}); recorded ${describeRecordedDismissal(outcome.event)} in .aidd/findings-ledger.jsonl`,
	);
	return 0;
}
