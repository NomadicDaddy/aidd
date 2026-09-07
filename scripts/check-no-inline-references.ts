#!/usr/bin/env bun
/**
 * Drizzle Named Foreign Key Check
 *
 * Enforces: ASSERT-012 (spernakit) / DATA-008 (aidd) -- Drizzle foreign keys are declared as
 * named `foreignKey({ ..., name })` constraints, never as inline `.references()`.
 *
 * An inline `.references()` produces a foreign key with no constraint name. Neither carrier can
 * afford that, for its own reason. spernakit ships two schema dialects and its migrations rely on
 * one constraint name meaning the same thing in SQLite and in PostgreSQL. aidd is SQLite-only,
 * where changing a table means the rebuild-copy-rename procedure -- see
 * `backend/src/db/migrations/0002_cline_backend.sql`, which restates
 * `CONSTRAINT fk_runs_pipeline_session_id_pipeline_sessions FOREIGN KEY (...)` by hand and matches
 * the schema's declared name byte for byte. A nameless foreign key gives that migration nothing to
 * restate, so the rebuild has to invent a name the schema does not know about.
 *
 * A schema-parity gate does not cover this and cannot be made to. Drizzle's `getTableConfig`
 * collects inline and named foreign keys into the same `InlineForeignKeys` array
 * (`drizzle-orm/sqlite-core/table.js`), so a reader of that array sees an identical shape either
 * way. The same is true of SQLite's `foreign_key_list` pragma: both forms produce a foreign key,
 * and only the source text records which form declared it. This rule is about the declaration, so
 * only a source scan can enforce it.
 *
 * This file is delivered by `sync-shared-core.ts`, so `SCHEMA_ROOTS` is the union across carriers
 * and a root that does not exist here is skipped rather than failed.
 *
 * Usage:
 *   bun scripts/check-no-inline-references.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';

const DEFAULT_PROJECT_ROOT = join(import.meta.dir, '..');
const SCHEMA_ROOTS = ['backend/src/db/schema', 'backend/src/db/schema-pg'];
const INLINE_REFERENCE = /\.references\s*\(/g;

interface Finding {
	content: string;
	file: string;
	line: number;
}

function collectTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...collectTypeScriptFiles(path));
		else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
	}
	return files;
}

function findInlineReferences(projectRoot: string, file: string): Finding[] {
	const source = readFileSync(file, 'utf8');
	const findings: Finding[] = [];
	for (const match of source.matchAll(INLINE_REFERENCE)) {
		const before = source.slice(0, match.index);
		const line = before.split('\n').length;
		findings.push({
			content: (source.split(/\r?\n/)[line - 1] ?? '').trim(),
			file: relative(projectRoot, file).replaceAll('\\', '/'),
			line,
		});
	}
	return findings;
}

export function runNoInlineReferences(projectRoot = DEFAULT_PROJECT_ROOT): number {
	const findings: Finding[] = [];
	let examined = 0;

	for (const root of SCHEMA_ROOTS) {
		const absoluteRoot = join(projectRoot, root);
		try {
			statSync(absoluteRoot);
		} catch {
			continue;
		}
		for (const file of collectTypeScriptFiles(absoluteRoot)) {
			examined++;
			findings.push(...findInlineReferences(projectRoot, file));
		}
	}

	if (findings.length > 0) {
		console.error('[FAIL] Inline .references() calls found in Drizzle schema files:\n');
		for (const finding of findings) {
			console.error(`  ${finding.file}:${finding.line}: ${finding.content}`);
		}
		console.error(
			'\nUse a named foreignKey({ columns, foreignColumns, name }) constraint instead.',
		);
		return 1;
	}

	// Skipping an absent root is deliberate (see SCHEMA_ROOTS), but skipping every one of them
	// means this file was delivered to a carrier with no Drizzle schema at all. Reporting [OK]
	// there would be a pass earned by looking at nothing.
	if (examined === 0) {
		console.error(
			`[FAIL] No schema files were examined. None of the schema roots exist under ` +
				`${projectRoot}: ${SCHEMA_ROOTS.join(', ')}.`,
		);
		return 1;
	}

	console.log(`[OK] No inline .references() calls found (${examined} schema file(s) examined).`);
	return 0;
}

if (import.meta.main) exit(runNoInlineReferences());
