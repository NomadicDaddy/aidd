#!/usr/bin/env bun
/**
 * check-audit-artifact-hygiene.ts
 *
 * Fails the build when any audit report under .aidd/audit-reports/ uses a date
 * (in filename or top-level heading) that is after the current local date.
 * This prevents reports with invalid future-dated metadata from landing.
 *
 * Scope: only .aidd/audit-reports/*.md files. Historical iteration logs and
 * feature.json files are not inspected because their dates record past events.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

const ROOT = resolve(import.meta.dir, '..');
const REPORTS_DIR = resolve(ROOT, '.aidd', 'audit-reports');

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

function listReports(): string[] {
	try {
		const entries = readdirSync(REPORTS_DIR);
		return entries
			.filter((entry) => entry.endsWith('.md'))
			.map((entry) => resolve(REPORTS_DIR, entry))
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

function relFromRoot(absPath: string): string {
	return absPath.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replace(/\\/g, '/');
}

function collectViolations(today: string, file: string): Violation[] {
	const violations: Violation[] = [];
	const rel = relFromRoot(file);
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

function main(): number {
	const today = todayLocalIso();
	const reports = listReports();

	if (reports.length === 0) {
		console.log('[OK] Audit artifact hygiene: no audit reports to inspect.');
		return 0;
	}

	const violations = reports.flatMap((file) => collectViolations(today, file));

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
	exit(main());
}
