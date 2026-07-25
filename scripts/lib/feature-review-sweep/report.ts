import fs from 'node:fs';
import path from 'node:path';

import { TODAY } from './constants.ts';
import { type AppSummary, type RunSummary, type ValidatorResult } from './types.ts';
import { ensureDir } from './util.ts';

function formatList(items: string[]): string {
	if (items.length === 0) {
		return '- none';
	}
	return items.map((item) => `- ${item}`).join('\n');
}

function summarizeValidatorOutput(validator: ValidatorResult): string {
	const combined = `${validator.stderr ?? ''}\n${validator.stdout ?? ''}`
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(
			(line) =>
				Boolean(line) &&
				!/^[=-]{5,}$/.test(line) &&
				!line.startsWith('Feature JSON Validation:') &&
				!line.startsWith('Total files:') &&
				!line.startsWith('Valid:') &&
				!line.startsWith('Invalid:'),
		);
	return combined || 'no validator output captured';
}

export function buildPerAppReport(summary: AppSummary): string {
	const lines: string[] = [];
	lines.push(`# Feature Review Sweep: ${summary.app.name}`);
	lines.push('');
	lines.push(`- Date: ${TODAY}`);
	lines.push(`- Mode: ${summary.mode}`);
	lines.push(`- Root: \`${summary.app.root}\``);
	lines.push(`- Depth: \`${summary.options.depth}\``);
	lines.push(`- Fix mode: \`${summary.options.fixMode}\``);
	lines.push('');
	lines.push('## Counts By Status');
	lines.push('');
	lines.push(`- Total features: ${summary.before.total}`);
	lines.push(`- Backlog-family: ${summary.before.backlog}`);
	lines.push(`- Completed: ${summary.before.completed}`);
	lines.push(`- Verified: ${summary.before.verified}`);
	lines.push(`- Other: ${summary.before.other}`);
	lines.push('');
	lines.push('## Inventory Health');
	lines.push('');
	lines.push(`- Invalid JSON before: ${summary.before.invalidJson}`);
	lines.push(`- Invalid JSON after: ${summary.after.invalidJson}`);
	lines.push(`- Legacy acceptance_criteria before: ${summary.before.legacyAcceptanceCriteria}`);
	lines.push(`- Legacy acceptance_criteria after: ${summary.after.legacyAcceptanceCriteria}`);
	lines.push(`- Legacy file_locations before: ${summary.before.legacyFileLocations}`);
	lines.push(`- Legacy file_locations after: ${summary.after.legacyFileLocations}`);
	lines.push(`- Mixed schema before: ${summary.before.mixedSchema}`);
	lines.push(`- Mixed schema after: ${summary.after.mixedSchema}`);
	lines.push(`- Missing dependencies before: ${summary.before.missingDependencies}`);
	lines.push(`- Missing dependencies after: ${summary.after.missingDependencies}`);
	lines.push(`- Orphan feature dirs before: ${summary.before.orphanDirs}`);
	lines.push(`- Orphan feature dirs after: ${summary.after.orphanDirs}`);
	lines.push('');
	lines.push('## Fix Summary');
	lines.push('');
	lines.push(`- Invalid JSON repairs: ${summary.invalidJsonRepairs}`);
	lines.push(`- Compliance/schema fixes: ${summary.complianceFixes}`);
	lines.push(`- Backlog semantic fixes: ${summary.backlogSemanticFixes}`);
	lines.push(`- Auto-closed redundant features: ${summary.autoClosedRedundant}`);
	lines.push(`- Touched feature files: ${summary.touchedFeatureFiles}`);
	lines.push(`- Orphan feature dirs removed: ${summary.removedOrphanDirs}`);
	lines.push(`- Reports written: ${summary.reportsWritten}`);
	lines.push('');
	lines.push('## Manual Follow-Ups');
	lines.push('');
	lines.push(formatList(summary.manualFollowUps));
	lines.push('');
	lines.push('## Duplicate / Overlap Hints');
	lines.push('');
	lines.push(formatList(summary.duplicateHints.map((items) => items.join(' | '))));
	lines.push('');
	lines.push('## Validation');
	lines.push('');
	if (summary.validator.skipped) {
		lines.push(`- Validator: skipped (${summary.validator.reason})`);
	} else {
		lines.push(`- Validator: ${summary.validator.ok ? 'PASS' : 'FAIL'}`);
		if (!summary.validator.ok) {
			lines.push(`- Exit status: ${summary.validator.status}`);
			lines.push(`- Detail: ${summarizeValidatorOutput(summary.validator)}`);
		}
	}
	lines.push('');
	lines.push('## Dirty Repo Guard');
	lines.push('');
	lines.push(`- Unsafe new diffs: ${summary.unsafeDiffs.length}`);
	lines.push(formatList(summary.unsafeDiffs));
	lines.push('');
	return lines.join('\n');
}

export function buildAggregateReport(runSummary: RunSummary): string {
	const lines: string[] = [];
	lines.push('# Cross-App Feature Review Sweep');
	lines.push('');
	lines.push(`- Date: ${TODAY}`);
	lines.push(`- Mode: ${runSummary.mode}`);
	lines.push(`- Depth: \`${runSummary.options.depth}\``);
	lines.push(`- Fix mode: \`${runSummary.options.fixMode}\``);
	lines.push(`- Apps in scope: ${runSummary.apps.length}`);
	lines.push(`- Total features discovered: ${runSummary.totals.totalFeatures}`);
	lines.push(`- Invalid JSON repaired: ${runSummary.totals.invalidJsonRepairs}`);
	lines.push(`- Compliance/schema fixes: ${runSummary.totals.complianceFixes}`);
	lines.push(`- Backlog semantic fixes: ${runSummary.totals.backlogSemanticFixes}`);
	lines.push(`- Auto-closed redundant features: ${runSummary.totals.autoClosedRedundant}`);
	lines.push(`- Manual follow-ups: ${runSummary.totals.manualFollowUps}`);
	lines.push(`- Unsafe out-of-scope diffs: ${runSummary.totals.unsafeDiffs}`);
	lines.push('');
	lines.push('## App Summary');
	lines.push('');
	for (const app of runSummary.apps) {
		const validatorState = app.validator.skipped
			? 'skipped'
			: app.validator.ok
				? 'PASS'
				: 'FAIL';
		lines.push(
			`- ${app.app.name}: total ${app.before.total}, repaired ${app.invalidJsonRepairs}, compliance fixes ${app.complianceFixes}, backlog semantic fixes ${app.backlogSemanticFixes}, manual follow-ups ${app.manualFollowUps.length}, validator ${validatorState}`,
		);
	}
	lines.push('');
	return lines.join('\n');
}

export function writeFileIfNeeded(targetPath: string, content: string): boolean {
	const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
	if (existing === content) {
		return false;
	}
	ensureDir(path.dirname(targetPath));
	fs.writeFileSync(targetPath, content, 'utf8');
	return true;
}
