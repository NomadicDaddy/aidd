#!/usr/bin/env bun
/**
 * Audit Artifact Hygiene Check
 *
 * Enforces: BEH-004 (aidd) / ASSERT-051 (spernakit) -- audit findings stay distinct and
 * well-formed as artifacts, which starts with a report never claiming a date that has not
 * happened yet.
 *
 * Fails the build when any audit report under .aidd/audit-reports/ uses a date
 * (in filename or top-level heading) that is after the current local date.
 * This prevents reports with invalid future-dated metadata from landing.
 *
 * Scope: only .aidd/audit-reports/*.md files. Historical iteration logs and
 * feature.json files are not inspected because their dates record past events.
 *
 * This file is delivered by `sync-shared-core.ts`, so it takes a project root rather than
 * resolving one from `import.meta.dir`.
 *
 * Zero reports is `[SKIP]`, not `[OK]`. Both carriers gitignore `/.aidd/` entirely, so the
 * directory this reads is untracked local working state: a fresh clone or a CI runner
 * legitimately has nothing here, and that is the one case the anti-vacuity rule exempts. It is
 * `[SKIP]` rather than `[OK]` so the distinction stays visible -- an `[OK]` over zero reports is
 * indistinguishable from an `[OK]` over a clean 300.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

const DEFAULT_PROJECT_ROOT = resolve(import.meta.dir, '..');
const REPORTS_SUBDIR = '.aidd/audit-reports';

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;

interface Violation {
	context?: string;
	date: string;
	file: string;
	kind: 'date-field' | 'filename' | 'heading';
}

function todayLocalIso(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function listReports(reportsDir: string): string[] {
	try {
		const entries = readdirSync(reportsDir);
		return entries
			.filter((entry) => entry.endsWith('.md'))
			.map((entry) => resolve(reportsDir, entry))
			.filter((path) => {
				try {
					return statSync(path).isFile();
				} catch {
					return false;
				}
			});
	} catch {
		return [];
	}
}

function relFromRoot(projectRoot: string, absPath: string): string {
	return absPath
		.replace(`${projectRoot}\\`, '')
		.replace(`${projectRoot}/`, '')
		.replace(/\\/g, '/');
}

function collectViolations(projectRoot: string, today: string, file: string): Violation[] {
	const violations: Violation[] = [];
	const rel = relFromRoot(projectRoot, file);
	const basename = file.split(/[\\/]/).pop() ?? '';

	const nameMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(basename);
	if (nameMatch && nameMatch[1]! > today) {
		violations.push({ date: nameMatch[1]!, file: rel, kind: 'filename' });
	}

	let source: string;
	try {
		source = readFileSync(file, 'utf8');
	} catch {
		return violations;
	}

	const lines = source.split(/\r?\n/);
	const firstHeading = lines.find((line) => line.startsWith('#')) ?? '';
	for (const match of firstHeading.matchAll(ISO_DATE)) {
		const date = match[1]!;
		if (date > today) {
			violations.push({
				context: firstHeading.trim(),
				date,
				file: rel,
				kind: 'heading',
			});
		}
	}

	for (const line of lines) {
		const dateFieldMatch = /^\s*\*?\*?Date:?\*?\*?\s*(\d{4}-\d{2}-\d{2})\b/.exec(line);
		if (dateFieldMatch && dateFieldMatch[1]! > today) {
			violations.push({
				context: line.trim(),
				date: dateFieldMatch[1]!,
				file: rel,
				kind: 'date-field',
			});
		}
	}

	return violations;
}

export function runAuditArtifactHygiene(projectRoot = DEFAULT_PROJECT_ROOT): number {
	const today = todayLocalIso();
	const reportsDir = resolve(projectRoot, REPORTS_SUBDIR);
	const reports = listReports(reportsDir);

	if (reports.length === 0) {
		console.log(
			`[SKIP] Audit artifact hygiene: no reports under ${REPORTS_SUBDIR}/. ` +
				`That directory is untracked local state, so a fresh clone has nothing to inspect.`,
		);
		return 0;
	}

	const violations = reports.flatMap((file) => collectViolations(projectRoot, today, file));

	if (violations.length === 0) {
		console.log(
			`[OK] Audit artifact hygiene: ${reports.length} report(s) at or before ${today}.`,
		);
		return 0;
	}

	console.error(`[FAIL] Audit artifact hygiene: ${violations.length} future-dated reference(s).`);
	console.error(`  Current local date: ${today}`);
	for (const violation of violations) {
		const suffix = violation.context ? ` — ${violation.context}` : '';
		console.error(`  ${violation.file} (${violation.kind}): ${violation.date}${suffix}`);
	}
	return 1;
}

if (import.meta.main) {
	exit(runAuditArtifactHygiene());
}
