import type { InitialPhase } from 'aidd-shared/metadata/onboarding';

import { readPersistedBlueprintReadiness } from 'aidd-shared/metadata/blueprint';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { readFile } from 'node:fs/promises';

// The phase of the newest ledger entry that recorded one. Directive, audit, and pre-phase entries
// carry no coding-family phase and are skipped, so they never mask the setup run before them.
async function lastRecordedPhase(projectDir: string): Promise<InitialPhase | null> {
	let text: string;
	try {
		text = await readFile(metadataPath(projectDir, 'runs.jsonl'), 'utf8');
	} catch {
		return null;
	}
	const lines = text.split('\n');
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index]?.trim();
		if (!line) continue;
		let phase: unknown;
		try {
			phase = (JSON.parse(line) as { phase?: unknown }).phase;
		} catch {
			continue;
		}
		if (phase === 'coding' || phase === 'initializer' || phase === 'onboarding') return phase;
	}
	return null;
}

/**
 * The initializer phase an untargeted coding run should resume, or null when it should code.
 *
 * `detectInitialPhase` reads `coding` as soon as one product feature, `spec.md`, and the CHANGELOG
 * exist, and an initializer writes all three long before it has a roadmap. So a setup run that
 * stopped early (parked on a decision, or out of iterations) leaves a project that detects as
 * coding-ready, and the next coding run would build its first feature on a half-made blueprint.
 * When the last phase-bearing run was an initializer and the blueprint is not yet ready, that phase
 * is not finished: resume it. That includes a blueprint whose metadata is complete but not yet
 * committed (`firstFeature` set): committing it is the initializer's last step, and a coding run
 * would otherwise start its first feature on top of the uncommitted blueprint. Existing-code
 * onboarding completes when `detectInitialPhase` reads coding and does not require an
 * initializer blueprint.
 */
export async function detectInterruptedSetupPhase(
	projectDir: string,
): Promise<'initializer' | null> {
	const phase = await lastRecordedPhase(projectDir);
	if (phase !== 'initializer') return null;
	const readiness = await readPersistedBlueprintReadiness(projectDir);
	return readiness.state === 'blocked' ? phase : null;
}
