import { spawnSync } from 'node:child_process';

import { type FeatureRecord, type RecordChange, type RecordStaleness } from './types.ts';

/**
 * Work nobody has started. Commits to files such a record only plans to touch say nothing about
 * the record. Everything else is in: a record left `in_progress` while its files move on is the
 * commonest stale record there is.
 */
const NOT_STARTED_STATUSES = new Set(['backlog', 'pending']);

/**
 * A record's `updatedAt` is stamped when the record is edited, and the commit that carries the
 * code it describes is made afterwards, so the two never match. A commit this soon after the
 * record was touched is taken to be that same piece of work and not a later change.
 */
const SAME_WORK_SLACK_MS = 24 * 60 * 60 * 1000;

type Commit = Omit<RecordChange, 'lagDays'>;

function git(repoRoot: string, args: string[]): null | string {
	const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
	return result.status === 0 ? result.stdout : null;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
		: [];
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** The newest commit touching `file`, or null when it has no history. Asked once per file. */
function newestCommitReader(repoRoot: string): (file: string) => Commit | null {
	const known = new Map<string, Commit | null>();
	return (file) => {
		const cached = known.get(file);
		if (cached !== undefined) return cached;
		const out = git(repoRoot, ['log', '-1', '--format=%H%x09%cI%x09%s', '--', file]) ?? '';
		const [commit = '', committedAt = '', ...subject] = out.trim().split('\t');
		// An empty answer has no date either, so one test covers "no history" and a line git did
		// not write in the asked-for shape.
		const found = Number.isNaN(Date.parse(committedAt))
			? null
			: { commit: commit.slice(0, 10), committedAt, subject: subject.join('\t') };
		known.set(file, found);
		return found;
	};
}

/** How many records name each file, across every record whatever its status. */
function recordsNaming(features: FeatureRecord[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const feature of features) {
		for (const file of new Set(stringList(feature.json?.['affectedFiles']))) {
			counts.set(file, (counts.get(file) ?? 0) + 1);
		}
	}
	return counts;
}

type Verdict =
	| { change: RecordStaleness['changedSince'][number]; kind: 'changed' }
	| { id: string; kind: 'not-checked'; reason: string }
	| { kind: 'current' }
	| { kind: 'left-out' };

function notChecked(id: string, reason: string): Verdict {
	return { id, kind: 'not-checked', reason };
}

interface Context {
	named: Map<string, number>;
	newest: (file: string) => Commit | null;
}

/**
 * The files that can say something about this record alone, with their newest commits, or the
 * reason there are none. A file several records name (a manifest, a changelog, a shared module) is
 * committed to for every one of them, so a later commit to it says nothing about any single record:
 * measured on six applications, counting such files flagged four records in five.
 */
function evidence(
	json: NonNullable<FeatureRecord['json']>,
	context: Context,
): { commits: Commit[]; ownFiles: number; updatedAtMs: number } | { reason: string } {
	const files = [...new Set(stringList(json['affectedFiles']))];
	if (files.length === 0) return { reason: 'names no affectedFiles' };
	const updatedAtMs = Date.parse(text(json['updatedAt']));
	if (Number.isNaN(updatedAtMs)) return { reason: 'has no usable updatedAt' };
	const own = files.filter((file) => context.named.get(file) === 1);
	if (own.length === 0) return { reason: 'every file it names is also named by another record' };
	const commits = own.map(context.newest).filter((commit) => commit !== null);
	if (commits.length === 0) return { reason: 'none of its own files has commit history' };
	return { commits, ownFiles: own.length, updatedAtMs };
}

function verdictFor(feature: FeatureRecord, context: Context): Verdict {
	const json = feature.json;
	if (!json) return { kind: 'left-out' };
	const status = text(json['status']);
	if (NOT_STARTED_STATUSES.has(status)) return { kind: 'left-out' };
	const id = text(json['id']) || feature.dir;
	const found = evidence(json, context);
	if ('reason' in found) return notChecked(id, found.reason);
	const later = found.commits
		.filter((commit) => Date.parse(commit.committedAt) - found.updatedAtMs > SAME_WORK_SLACK_MS)
		.sort((a, b) => Date.parse(b.committedAt) - Date.parse(a.committedAt));
	const newest = later[0];
	if (newest === undefined) return { kind: 'current' };
	const lagMs = Date.parse(newest.committedAt) - found.updatedAtMs;
	return {
		change: {
			...newest,
			filesMoved: later.length,
			id,
			lagDays: Math.floor(lagMs / SAME_WORK_SLACK_MS),
			ownFiles: found.ownFiles,
			status,
			updatedAt: text(json['updatedAt']),
		},
		kind: 'changed',
	};
}

/**
 * For each record of work that is under way or done, compare when the record was last edited with
 * the newest commit to the files only that record names. A later commit does not prove the record
 * wrong; it says code that is this record's alone moved after anyone last looked at the record,
 * which is where a reader should look first.
 *
 * Nothing here is reported as current that was not checked: a record with no files, no usable
 * date, no file of its own, or files that have no history is listed as not checked, with the
 * reason.
 */
export function checkRecordStaleness(repoRoot: string, features: FeatureRecord[]): RecordStaleness {
	const result: RecordStaleness = { changedSince: [], checked: 0, notChecked: [], reason: null };
	if (git(repoRoot, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') {
		return { ...result, reason: 'not a git repository, so no record could be checked' };
	}
	const context = { named: recordsNaming(features), newest: newestCommitReader(repoRoot) };
	for (const feature of features) {
		const verdict = verdictFor(feature, context);
		if (verdict.kind === 'not-checked') {
			result.notChecked.push({ id: verdict.id, reason: verdict.reason });
		} else if (verdict.kind !== 'left-out') {
			result.checked += 1;
			if (verdict.kind === 'changed') result.changedSince.push(verdict.change);
		}
	}
	// Most of a record's own files moved first, then the longest gap: the likeliest stale on top.
	result.changedSince.sort(
		(a, b) =>
			b.filesMoved / b.ownFiles - a.filesMoved / a.ownFiles ||
			b.lagDays - a.lagDays ||
			a.id.localeCompare(b.id),
	);
	return result;
}
