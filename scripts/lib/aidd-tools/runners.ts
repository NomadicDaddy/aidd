import { type AuditProfileMapping, projectAssuranceBuckets } from 'aidd-shared';
import {
	auditProfileMappingPath,
	loadAuditProfileMapping,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';
import { join } from 'node:path';

import {
	applyRoadmap,
	collectFeatureStatus,
	discoverAiddProjects,
	summarizeFeatureStatus,
} from '../aidd-workspace.ts';
import { runInteractiveCommand } from '../process.ts';
import {
	formatFeatureStatusEntries,
	formatFeatureStatusSummaryTable,
	printRoadmapApplySummary,
} from './formatting.ts';
import {
	splitAuditName,
	takeApplicationsOptions,
	takeFeatureStatusOptions,
	takeProjectDir,
} from './options.ts';
import { aiddEntry, featureReviewSweep, rootDir } from './paths.ts';

// These wrappers spawn the aidd CLI itself, which may run LLM-backed audit sessions
// (e.g. UI_PARITY, SPERNAKIT, features:from-audit) that re-derive their backend environment via
// buildBackendSubprocessEnv. Forward the same justified allowlist (runtime + provider credentials)
// instead of the full Bun.env so unrelated parent variables are not propagated verbatim.
async function runAidd(projectDir: string, argv: string[]): Promise<number> {
	return await runInteractiveCommand({
		command: ['bun', aiddEntry, '--project-dir', projectDir, ...argv],
		cwd: rootDir,
		env: buildBackendSubprocessEnv({ NO_COLOR: '1' }),
	});
}

async function runAiddAudit(auditName: string, argv: string[]): Promise<number> {
	const { projectDir, rest } = takeProjectDir(argv);
	return await runAidd(projectDir, ['--audit', auditName, ...rest]);
}

async function runPreRebuild(argv: string[]): Promise<number> {
	const { projectDir, rest } = takeProjectDir(argv);
	if (rest.length > 0) throw new Error(`Unknown pre-rebuild option(s): ${rest.join(' ')}`);
	for (const checkArgs of [['--check-features'], ['--check-artifacts']]) {
		const exitCode = await runAidd(projectDir, checkArgs);
		if (exitCode !== 0) return exitCode;
	}
	return 0;
}

async function runFleetCheck(argv: string[]): Promise<number> {
	const { applications, applicationsRoot: selectedRoot, rest } = takeApplicationsOptions(argv);
	if (rest.length > 0) throw new Error(`Unknown fleet:check option(s): ${rest.join(' ')}`);
	const projects = await discoverAiddProjects({
		...(applications !== undefined ? { applications } : {}),
		applicationsRoot: selectedRoot,
	});
	if (projects.length === 0) {
		console.error(`No .aidd projects found under ${selectedRoot}`);
		return 1;
	}

	let failures = 0;
	for (const project of projects) {
		for (const checkArgs of [['--check-features'], ['--check-artifacts']]) {
			console.log(
				`\n[${project.name}] bun ${aiddEntry} --project-dir ${project.projectDir} ${checkArgs[0]}`,
			);
			const exitCode = await runAidd(project.projectDir, checkArgs);
			if (exitCode !== 0) failures++;
		}
	}
	if (failures > 0) {
		console.error(`fleet:check failed: ${failures} check(s) exited nonzero`);
		return 1;
	}
	return 0;
}

async function runFeatureStatus(argv: string[]): Promise<number> {
	const options = takeFeatureStatusOptions(argv);
	const entries = await collectFeatureStatus({
		...(options.applications !== undefined ? { applications: options.applications } : {}),
		applicationsRoot: options.applicationsRoot,
		...(options.state !== undefined ? { state: options.state } : {}),
		...(options.types !== undefined ? { types: options.types } : {}),
	});

	if (options.summary) {
		console.log(formatFeatureStatusSummaryTable(summarizeFeatureStatus(entries)));
	} else {
		const output = formatFeatureStatusEntries(entries);
		if (output.length > 0) console.log(output);
	}
	return 0;
}

async function runRoadmapApply(argv: string[]): Promise<number> {
	const { projectDir, rest } = takeProjectDir(argv);
	const dryRun = rest.includes('--dry-run');
	const unknown = rest.filter((arg) => arg !== '--dry-run');
	if (unknown.length > 0)
		throw new Error(`Unknown roadmap:apply option(s): ${unknown.join(' ')}`);

	const summary = await applyRoadmap(projectDir, { dryRun });
	printRoadmapApplySummary(summary);
	return summary.errors.length > 0 ? 1 : 0;
}

async function runFeatureAuditGeneration(argv: string[]): Promise<number> {
	const { auditName, rest } = splitAuditName(argv);
	return await runAiddAudit(auditName, rest);
}

async function runFeatureReviewSweep(argv: string[]): Promise<number> {
	return await runInteractiveCommand({
		command: ['bun', featureReviewSweep, ...argv],
		cwd: rootDir,
		env: buildBackendSubprocessEnv({ AIDD_ROOT: rootDir, NO_COLOR: '1' }),
	});
}

async function ensureChangelog(argv: string[]): Promise<number> {
	const { projectDir, rest } = takeProjectDir(argv);
	const write = rest.includes('--write');
	const unknown = rest.filter((arg) => arg !== '--write');
	if (unknown.length > 0) throw new Error(`Unknown changelog option(s): ${unknown.join(' ')}`);

	const store = new FileAiddStore(projectDir);
	const changelog = write ? await store.writeChangelog() : await store.generateChangelog();
	if (write) {
		console.log(`Wrote ${join(projectDir, '.aidd', 'CHANGELOG.md')}`);
	} else {
		console.log(changelog.trimEnd());
	}
	return 0;
}

async function runValidateAuditProfileMapping(argv: string[]): Promise<number> {
	if (argv.length > 0) {
		throw new Error(`Unknown audit:profile-mapping option(s): ${argv.join(' ')}`);
	}
	const mappingPath = auditProfileMappingPath(rootDir);
	let mapping: AuditProfileMapping;
	try {
		mapping = await loadAuditProfileMapping(rootDir);
	} catch (err) {
		console.error(
			`audit:profile-mapping FAILED: ${err instanceof Error ? err.message : String(err)}`,
		);
		console.error(`  file: ${mappingPath}`);
		return 1;
	}

	const auditNames = await discoverAuditNames(rootDir);
	const knownAudits = new Set(auditNames.map((entry) => entry.toUpperCase()));

	const errors: string[] = [];

	for (const rule of mapping.rules) {
		for (const audit of rule.audits) {
			if (audit === '*') continue;
			if (!knownAudits.has(audit.toUpperCase())) {
				errors.push(`Rule ${rule.id} references unknown audit: ${audit}`);
			}
		}
	}

	const ruleIds = mapping.rules.map((rule) => rule.id);
	const duplicateRuleIds = ruleIds.filter((id, index) => ruleIds.indexOf(id) !== index);
	for (const duplicate of duplicateRuleIds) {
		errors.push(`Duplicate rule id: ${duplicate}`);
	}

	const reachableAudits = new Set<string>();
	const referencedAudits = new Set<string>();
	for (const rule of mapping.rules) {
		for (const audit of rule.audits) {
			if (audit === '*') continue;
			referencedAudits.add(audit.toUpperCase());
		}
	}

	const probeProfiles = projectAssuranceBuckets.map((bucket) => ({
		authMode: 'login' as const,
		bucket,
		criticality: 'utility' as const,
		dataSensitivity: 'personal' as const,
		deployment: 'private_server' as const,
		externalIntegrations: 'read_only' as const,
		source: 'inferred' as const,
		updatedAt: '1970-01-01T00:00:00.000Z',
	}));

	const { isAuditApplicableToProfile } = await import('aidd-shared');
	for (const name of knownAudits) {
		for (const profile of probeProfiles) {
			if (isAuditApplicableToProfile(profile, name, mapping)) {
				reachableAudits.add(name);
				break;
			}
		}
	}
	for (const audit of knownAudits) {
		if (!reachableAudits.has(audit)) {
			errors.push(
				`Audit ${audit} is unreachable: excluded by global rules for every assurance bucket`,
			);
		}
	}

	if (errors.length > 0) {
		console.error('audit:profile-mapping FAILED');
		for (const error of errors) console.error(`  - ${error}`);
		return 1;
	}

	console.log(
		`audit:profile-mapping OK (${mapping.rules.length} rule(s), ${knownAudits.size} runnable audit(s), ${referencedAudits.size} rule-referenced)`,
	);
	return 0;
}

export {
	ensureChangelog,
	runAiddAudit,
	runFeatureAuditGeneration,
	runFeatureReviewSweep,
	runFeatureStatus,
	runFleetCheck,
	runPreRebuild,
	runRoadmapApply,
	runValidateAuditProfileMapping,
};
