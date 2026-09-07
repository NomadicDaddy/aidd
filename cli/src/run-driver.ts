import type { RunPlan } from 'aidd-shared/plan/types';
import type { AiddRunDriver } from 'aidd-shared/run-provenance';

import { sha256Text } from 'aidd-shared/content-hash';
import {
	EXT_RUN_DRIVER_ID_ENV,
	EXT_RUN_DRIVER_KIND_ENV,
	EXT_RUN_DRIVER_SHA256_ENV,
} from 'aidd-shared/metadata/active-runs';
import { parseAiddRunDriver, resolveAuditRunDriver } from 'aidd-shared/run-provenance';
import { join } from 'node:path';

function presentEnv(value: string | undefined): string | undefined {
	// An empty variable is what a shell leaves behind after `export AIDD_EXT_RUN_DRIVER_KIND=`;
	// it carries no provenance and must not turn into a parse failure.
	return value === undefined || value === '' ? undefined : value;
}

/**
 * The driver a parent process (the web backend, a recipe runner) attributed this run to. Provenance
 * capture never aborts the run it describes: an unparseable value is logged and ignored.
 */
export function externalRunDriver(env: NodeJS.ProcessEnv = process.env): AiddRunDriver | undefined {
	const driverKind = presentEnv(env[EXT_RUN_DRIVER_KIND_ENV]);
	const driverId = presentEnv(env[EXT_RUN_DRIVER_ID_ENV]);
	const driverSha256 = presentEnv(env[EXT_RUN_DRIVER_SHA256_ENV]);
	if (driverKind === undefined && driverId === undefined && driverSha256 === undefined) {
		return undefined;
	}
	const parsed = parseAiddRunDriver({ driverId, driverKind, driverSha256 });
	if (parsed === undefined) {
		console.warn(
			`[run-driver] Ignoring unparseable external run driver provenance (${EXT_RUN_DRIVER_KIND_ENV}=${driverKind ?? ''}, ${EXT_RUN_DRIVER_ID_ENV}=${driverId ?? ''}); recording no driver`,
		);
		return undefined;
	}
	return parsed;
}

export function promptRunDriver(prompt: string): AiddRunDriver {
	return {
		driverId: null,
		driverKind: 'prompt',
		driverSha256: sha256Text(prompt),
	};
}

/**
 * Precedence: the most specific description of what drove the run wins. A skill launched through
 * a recipe step records the skill (kind `skill`, the skill id, its SKILL.md hash); the step's
 * identity still travels in pipeline_step_results.step_definition_id. Without a skill, the
 * externally supplied driver (a recipe step running a plain prompt) applies; failing that, a
 * custom prompt is hashed. Audit mode overrides all of these later via setAuditRunDriver, so an
 * audit inside a recipe step records the audit.
 */
export function runDriverForPlan(
	plan: RunPlan,
	skillDriver: AiddRunDriver | undefined,
	env: NodeJS.ProcessEnv = process.env,
): AiddRunDriver | undefined {
	return (
		skillDriver ??
		externalRunDriver(env) ??
		(plan.prompt.customDirective === undefined
			? undefined
			: promptRunDriver(plan.prompt.customDirective))
	);
}

export async function setAuditRunDriver(
	plan: RunPlan,
	rootDir: string,
	auditNames: readonly string[],
): Promise<void> {
	const { driver, missingAudits } = await resolveAuditRunDriver(rootDir, auditNames);
	if (missingAudits.length > 0) {
		console.warn(
			`[run-driver] Audit definition(s) not readable under ${join(rootDir, 'audits')}: ${missingAudits.join(', ')}; recording driverSha256 as null`,
		);
	}
	plan.driver = driver;
}
