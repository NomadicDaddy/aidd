#!/usr/bin/env bun
/**
 * One-time backfill for `completedAt` (and the `createdAt` gaps) in a project's `.aidd/features`.
 *
 * `completedAt` was introduced after the fact, so every feature completed before it existed has no
 * record of *when* it finished. `updatedAt` cannot stand in — it is the last metadata write of any
 * kind, and measured against each feature's own first revision note it runs a median 15 days late.
 * So the value is reconstructed from the best evidence each record actually carries, in order:
 *
 * | Tier | Source | Precision |
 * | --- | --- | --- |
 * | `runs` | first appearance in a run's `completedFeatures[]` in `.aidd/runs.jsonl` | exact instant |
 * | `notes` | the first `Revision <ver> (<date>)` note — first ship ≈ completion | day |
 * | `updated` | `updatedAt` | last write |
 *
 * The runs ledger wins because the run is what completed the feature; cross-checked against the
 * note dates on the features carrying both, it lands a median 3 days earlier, which is the right
 * direction — the revision note is written after the fact.
 *
 * `shippedVersion` is deliberately not a tier. It records the *latest* ship, re-stamped on every
 * revision, so it reproduces the same drift as `updatedAt`; and there is no version-to-date table
 * to resolve it with anyway — the only in-repo mapping is built from the revision notes above,
 * which already carry the date.
 *
 * Reads and writes `.aidd/` directly rather than going through the API: `notes` and `aiddReport`
 * are stripped from the web payload, and those are two of the three signals.
 *
 * Run `--dry-run` first. Afterwards the files must be re-formatted, because on-disk `feature.json`
 * are prettier-formatted (sorted keys, tabs) and `.aidd/` is prettier-ignored here — the command
 * pair is printed on completion.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Tier = 'aiddReport' | 'notes' | 'runs' | 'updated';

interface FeatureRecord {
	directory: string;
	json: Record<string, unknown>;
	path: string;
}

const REVISION_NOTE = /^Revision\s+\S+\s+\((\d{4}-\d{2}-\d{2})\)/;

function arg(name: string): string | undefined {
	const prefix = `--${name}=`;
	const match = process.argv.find((value) => value.startsWith(prefix));
	return match?.slice(prefix.length);
}

/** First appearance per feature id, by run end. The ledger is append-ordered but sorted anyway —
 * a resumed or replayed run can land out of order, and "earliest" is the whole point. */
async function runsLedgerFirstCompletion(metadataDir: string): Promise<Map<string, string>> {
	const text = await readFile(join(metadataDir, 'runs.jsonl'), 'utf8').catch(() => '');
	const runs: { endedAt: string; ids: string[] }[] = [];
	for (const line of text.split('\n')) {
		if (line.trim().length === 0) continue;
		let parsed: { completedFeatures?: unknown; endedAt?: unknown };
		try {
			parsed = JSON.parse(line) as typeof parsed;
		} catch {
			continue;
		}
		if (typeof parsed.endedAt !== 'string' || !Array.isArray(parsed.completedFeatures))
			continue;
		const ids = parsed.completedFeatures.filter((id): id is string => typeof id === 'string');
		if (ids.length > 0) runs.push({ endedAt: parsed.endedAt, ids });
	}
	runs.sort((left, right) => left.endedAt.localeCompare(right.endedAt));
	const first = new Map<string, string>();
	for (const run of runs) {
		for (const id of run.ids) if (!first.has(id)) first.set(id, run.endedAt);
	}
	return first;
}

/** The date of the earliest `Revision <ver> (<date>)` note, as a midday UTC instant — the note
 * carries a day, and midday keeps it on that day in every timezone the record is read from. */
function firstRevisionNoteInstant(json: Record<string, unknown>): string | undefined {
	const notes = Array.isArray(json.notes) ? json.notes : [];
	const dates = notes
		.map((note) => (typeof note === 'string' ? REVISION_NOTE.exec(note)?.[1] : undefined))
		.filter((date): date is string => date !== undefined)
		.sort();
	return dates[0] === undefined ? undefined : `${dates[0]}T12:00:00.000Z`;
}

function stringField(json: Record<string, unknown>, key: string): string | undefined {
	const value = json[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function ledgerInstant(record: FeatureRecord, runs: Map<string, string>): string | undefined {
	const id = stringField(record.json, 'id') ?? record.directory;
	return runs.get(id) ?? runs.get(record.directory);
}

function resolveCompletedAt(
	record: FeatureRecord,
	runs: Map<string, string>,
): { tier: Tier; value: string } | undefined {
	const fromRuns = ledgerInstant(record, runs);
	if (fromRuns) return { tier: 'runs', value: fromRuns };
	const fromNotes = firstRevisionNoteInstant(record.json);
	if (fromNotes) return { tier: 'notes', value: fromNotes };
	const updated = stringField(record.json, 'updatedAt');
	return updated ? { tier: 'updated', value: updated } : undefined;
}

function resolveCreatedAt(
	record: FeatureRecord,
	runs: Map<string, string>,
): { tier: Tier; value: string } | undefined {
	const report = record.json.aiddReport;
	if (report !== null && typeof report === 'object') {
		const reported = stringField(report as Record<string, unknown>, 'createdAt');
		if (reported) return { tier: 'aiddReport', value: reported };
	}
	const fromRuns = ledgerInstant(record, runs);
	return fromRuns ? { tier: 'runs', value: fromRuns } : undefined;
}

async function loadFeatures(metadataDir: string): Promise<FeatureRecord[]> {
	const featuresDir = join(metadataDir, 'features');
	const entries = await readdir(featuresDir, { withFileTypes: true });
	const records: FeatureRecord[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const path = join(featuresDir, entry.name, 'feature.json');
		const raw = await readFile(path, 'utf8').catch(() => undefined);
		if (raw === undefined) continue;
		try {
			records.push({
				directory: entry.name,
				json: JSON.parse(raw) as FeatureRecord['json'],
				path,
			});
		} catch {
			console.warn(`skipped unparseable ${path}`);
		}
	}
	return records.sort((left, right) => left.directory.localeCompare(right.directory));
}

function plannedChanges(
	record: FeatureRecord,
	runs: Map<string, string>,
	tally: { completed: Map<Tier, number>; created: Map<Tier, number>; unresolved: string[] },
): Record<string, string> {
	const changes: Record<string, string> = {};
	const bump = (tiers: Map<Tier, number>, tier: Tier): void => {
		tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
	};
	if (
		stringField(record.json, 'status') === 'completed' &&
		stringField(record.json, 'completedAt') === undefined
	) {
		const resolved = resolveCompletedAt(record, runs);
		if (resolved) {
			changes.completedAt = resolved.value;
			bump(tally.completed, resolved.tier);
		} else {
			tally.unresolved.push(`${record.directory} (completedAt)`);
		}
	}
	if (stringField(record.json, 'createdAt') === undefined) {
		const resolved = resolveCreatedAt(record, runs);
		if (resolved) {
			changes.createdAt = resolved.value;
			bump(tally.created, resolved.tier);
		} else {
			tally.unresolved.push(`${record.directory} (createdAt)`);
		}
	}
	return changes;
}

async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');
	const projectDir = arg('project-dir') ?? process.cwd();
	const metadataDir = join(projectDir, '.aidd');
	const runs = await runsLedgerFirstCompletion(metadataDir);
	const records = await loadFeatures(metadataDir);
	const tally = {
		completed: new Map<Tier, number>(),
		created: new Map<Tier, number>(),
		unresolved: [] as string[],
	};
	let written = 0;

	for (const record of records) {
		const changes = plannedChanges(record, runs, tally);
		if (Object.keys(changes).length === 0) continue;
		written += 1;
		if (dryRun) {
			console.log(`${record.directory}: ${JSON.stringify(changes)}`);
			continue;
		}
		await writeFile(
			record.path,
			`${JSON.stringify({ ...record.json, ...changes }, null, 2)}\n`,
		);
	}

	const tierLine = (tiers: Map<Tier, number>): string =>
		[...tiers.entries()].map(([tier, count]) => `${tier}=${count}`).join(' ') || 'none';
	console.log(`\nfeatures scanned: ${records.length}`);
	console.log(`completedAt by tier: ${tierLine(tally.completed)}`);
	console.log(`createdAt by tier:   ${tierLine(tally.created)}`);
	console.log(`${dryRun ? 'would write' : 'wrote'}: ${written} file(s)`);
	if (tally.unresolved.length > 0) console.log(`unresolved: ${tally.unresolved.join(', ')}`);
	if (!dryRun && written > 0) {
		console.log('\nnow re-format and validate the records:');
		console.log(
			'  bunx prettier --write --ignore-path /dev/null ".aidd/features/*/feature.json"',
		);
		console.log('  bun run start -- --project-dir . --check-features');
	}
}

await main();
