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

function git(repoRoot: string, args: string[]): null | string {
	const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
	return result.status === 0 ? result.stdout : null;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
		: [];
}

/** The newest commit touching any of `files`, or null when none of them has history. */
function newestCommit(repoRoot: string, files: string[]): null | Omit<RecordChange, 'lagDays'> {
	const out = git(repoRoot, ['log', '-1', '--format=%H%x09%cI%x09%s', '--', ...files]) ?? '';
	const [commit = '', committedAt = '', ...subject] = out.trim().split('\t');
	// An empty answer has no date either, so one test covers "no history" and a line git did not
	// write in the asked-for shape.
	if (Number.isNaN(Date.parse(committedAt))) return null;
	return { commit: commit.slice(0, 10), committedAt, subject: subject.join('\t') };
}

type Verdict =
	| { change: RecordStaleness['changedSince'][number]; kind: 'changed' }
	| { id: string; kind: 'not-checked'; reason: string }
	| { kind: 'current' }
	| { kind: 'left-out' };

function notChecked(id: string, reason: string): Verdict {
	return { id, kind: 'not-checked', reason };
}

/** What the record needs before it can be compared, or the reason it cannot be. */
function comparable(
	json: NonNullable<FeatureRecord['json']>,
): { files: string[]; updatedAtMs: number } | { reason: string } {
	const files = stringList(json['affectedFiles']);
	if (files.length === 0) return { reason: 'names no affectedFiles' };
	const updatedAtMs = Date.parse(String(json['updatedAt'] ?? ''));
	if (Number.isNaN(updatedAtMs)) return { reason: 'has no usable updatedAt' };
	return { files, updatedAtMs };
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function verdictFor(repoRoot: string, feature: FeatureRecord): Verdict {
	const json = feature.json;
	if (!json) return { kind: 'left-out' };
	const status = text(json['status']);
	if (NOT_STARTED_STATUSES.has(status)) return { kind: 'left-out' };
	const id = text(json['id']) || feature.dir;
	const inputs = comparable(json);
	if ('reason' in inputs) return notChecked(id, inputs.reason);
	const newest = newestCommit(repoRoot, inputs.files);
	if (newest === null) return notChecked(id, 'none of its affectedFiles has commit history');
	const lagMs = Date.parse(newest.committedAt) - inputs.updatedAtMs;
	if (lagMs <= SAME_WORK_SLACK_MS) return { kind: 'current' };
	const lagDays = Math.floor(lagMs / SAME_WORK_SLACK_MS);
	return {
		change: { ...newest, id, lagDays, status, updatedAt: String(json['updatedAt']) },
		kind: 'changed',
	};
}

/**
 * For each record of work that is under way or done, compare when the record was last edited with
 * the newest commit to the files it names. A later commit does not prove the record wrong; it says
 * the code moved after anyone last looked at the record, which is where a reader should look first.
 *
 * Nothing here is reported as current that was not checked: a record with no files, no usable
 * date, or files that have no history is listed as not checked, with the reason.
 */
export function checkRecordStaleness(repoRoot: string, features: FeatureRecord[]): RecordStaleness {
	const result: RecordStaleness = { changedSince: [], checked: 0, notChecked: [], reason: null };
	if (git(repoRoot, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') {
		return { ...result, reason: 'not a git repository, so no record could be checked' };
	}
	for (const feature of features) {
		const verdict = verdictFor(repoRoot, feature);
		if (verdict.kind === 'not-checked') {
			result.notChecked.push({ id: verdict.id, reason: verdict.reason });
		} else if (verdict.kind !== 'left-out') {
			result.checked += 1;
			if (verdict.kind === 'changed') result.changedSince.push(verdict.change);
		}
	}
	result.changedSince.sort((a, b) => b.lagDays - a.lagDays || a.id.localeCompare(b.id));
	return result;
}
