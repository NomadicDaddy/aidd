import type { FeatureBlockingContext } from 'aidd-shared/metadata/features';

import type { IterationDetails } from '../details/types.ts';

import { uniqueOrdered } from '../details/shared.ts';

const OUTPUT_EXCERPT_LIMIT = 2000;

// Verification/commit gates whose recorded failure is the usual reason a completion never lands.
const gateCommandPattern =
	/\b(?:bun|npm|pnpm|yarn)\s+run\s+(?:smoke:qc|smoke:dev|smoke:preview|lint|typecheck|type-check|build|format(?::check)?|test|check-features)\b|\bgit\s+commit\b|\b(?:agent-browser|crawltest|playwright)\b/i;

// Assemble the blocking context persisted onto a feature at parking time. The evidence is
// best-effort — drawn from the iteration details already computed for the run — so an operator (and
// the next run's agent) can see WHICH gate failed and a slice of its output instead of approving a
// blind bounce.
export function buildFeatureBlockingContext(
	details: IterationDetails,
	reason: string,
	parkedAt: string,
): FeatureBlockingContext {
	const recovery = details.outcome.activeVerificationRecovery;
	const commands = recovery
		? uniqueOrdered([recovery.timedOutCommand, ...recovery.commands])
		: blockingCommands(details);
	return {
		commands,
		outcomeStatus: details.outcome.status,
		outputExcerpt: blockingExcerpt(details),
		parkedAt,
		reason,
	};
}

// Prefer gates we positively recorded as failing. When the backend never reported a single
// command verdict (no exit codes, no [PASS]/[FAIL] markers — the opencode/kilocode shape), an empty
// failedCommands means "undetectable", not "all clean", so fall back to the gates that ran rather
// than parking the feature with no evidence at all. Backends that DO report verdicts (Codex exit
// codes, claude-code's exit-code marker) get no fallback: their silence is trustworthy, and guessing
// would resurrect the false positives that made passing gates look like failures.
function blockingCommands(details: IterationDetails): string[] {
	const failed = gateCommands(details.failedCommands);
	if (failed.length > 0 || details.commandStatusEvidence) return failed;
	return gateCommands(details.commands);
}

function gateCommands(commands: string[]): string[] {
	return uniqueOrdered(commands.filter((command) => gateCommandPattern.test(command)));
}

function blockingExcerpt(details: IterationDetails): string {
	const errors = details.errors.map((error) => error.message.trim()).filter(Boolean);
	if (errors.length > 0) return errors.join('\n---\n').slice(0, OUTPUT_EXCERPT_LIMIT);
	const recovery = details.outcome.activeVerificationRecovery;
	if (recovery && recovery.targetedEvidence.length > 0) {
		return `Broad gate "${recovery.timedOutCommand}" timed out while targeted checks passed:\n${recovery.targetedEvidence.join(
			'\n',
		)}`.slice(0, OUTPUT_EXCERPT_LIMIT);
	}
	return '';
}
