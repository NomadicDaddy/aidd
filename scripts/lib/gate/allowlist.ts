/**
 * The shrinking allowlist.
 *
 * Phase 1 makes the conventions enforceable without rewriting every gate in one commit, so each
 * rule the existing population does not satisfy is declared here with the gates that fail it and
 * one reason. That is the whole trick: the gate is green on day one and every NEW gate is held to
 * the full rules from the moment it is written.
 *
 * The list is keyed by rule rather than by path because the reason genuinely is per-rule. Thirty
 * gates do not each have their own story about why they call `main()` at module scope; they have
 * one story, and repeating it thirty times would make the file unreadable and the reasons
 * unmaintained.
 *
 * What makes the list shrink rather than sit is the stale-entry check. A waived path whose rule now
 * passes is itself a finding, so a gate cannot be fixed and left waived, and the file cannot
 * quietly accumulate entries that no longer describe anything.
 */

import { type Finding, type Gate, type RuleId, STATIC_RULES } from './types.ts';

export interface RuleWaiver {
	/** Repo-relative paths, forward slashes. Each must still be a discovered gate. */
	paths: string[];
	/** Why the listed gates do not satisfy this rule yet. Mandatory. */
	reason: string;
}

export interface Allowlist {
	/** Paths a `check*` task reaches that are not gates, each with a reason. */
	excluded: Record<string, string>;
	/**
	 * Tasks that are gates without being named `check*`, each with a reason.
	 *
	 * The mirror image of `excluded`, and the only way into the population that is not the naming
	 * convention. It exists because four tasks in this fleet assert about the repository and fail
	 * the build under a different verb, so the convention alone reported a population smaller than
	 * the suite it was describing.
	 */
	gates: Record<string, string>;
	waivers: Partial<Record<RuleId, RuleWaiver>>;
}

const EMPTY: Allowlist = { excluded: {}, gates: {}, waivers: {} };

/** Read one `{ key: reason }` section, rejecting a missing or blank reason. */
function reasonMap(raw: unknown, field: string, key: string): Record<string, string> {
	const map: Record<string, string> = {};
	if (raw === undefined) return map;
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw new Error(`allowlist "${field}" must be an object of ${key} to reason`);
	}
	for (const [name, reason] of Object.entries(raw)) {
		if (typeof reason !== 'string' || reason.trim() === '') {
			throw new Error(`allowlist "${field}" entry ${name} has no reason`);
		}
		map[name] = reason;
	}
	return map;
}

/** Parse and validate an allowlist document. Throws with a specific message on a malformed entry. */
export function parseAllowlist(text: string): Allowlist {
	const parsed: unknown = JSON.parse(text);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('allowlist must be a JSON object');
	}
	const raw = parsed as { excluded?: unknown; gates?: unknown; waivers?: unknown };

	const excluded = reasonMap(raw.excluded, 'excluded', 'path');
	const gates = reasonMap(raw.gates, 'gates', 'task');

	const waivers: Partial<Record<RuleId, RuleWaiver>> = {};
	if (raw.waivers !== undefined) {
		if (typeof raw.waivers !== 'object' || raw.waivers === null) {
			throw new Error('allowlist "waivers" must be an object keyed by rule');
		}
		for (const [rule, value] of Object.entries(raw.waivers)) {
			if (!STATIC_RULES.includes(rule as RuleId)) {
				throw new Error(`allowlist waives unknown rule ${rule}`);
			}
			const entry = value as Partial<RuleWaiver>;
			if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
				throw new Error(`allowlist waiver ${rule} has no reason`);
			}
			if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
				throw new Error(`allowlist waiver ${rule} names no paths`);
			}
			waivers[rule as RuleId] = { paths: [...entry.paths].sort(), reason: entry.reason };
		}
	}

	return { excluded, gates, waivers };
}

/** Read an allowlist from disk, treating an absent file as an empty one. */
export async function loadAllowlist(path: string): Promise<Allowlist> {
	const file = Bun.file(path);
	if (!(await file.exists())) return EMPTY;
	return parseAllowlist(await file.text());
}

export interface Applied {
	/** Findings the allowlist suppressed, for `--list-waived`. */
	suppressed: Finding[];
	/** Findings that stand, plus the allowlist's own stale entries. */
	surviving: Finding[];
}

/**
 * Split findings by the allowlist, and report every entry that no longer describes anything.
 *
 * `gates` is the population after exclusions and `allPaths` the population before them, so a stale
 * `excluded` entry -- naming a path no `check*` task reaches any more -- is caught as well as a
 * stale waiver. `declarationProblems` carries the same treatment for the `gates` map, computed by
 * `staleDeclarations` because only the caller has the package.json the declarations point at.
 */
export function applyAllowlist(
	allowlist: Allowlist,
	gates: Gate[],
	findings: Finding[],
	allPaths: Set<string>,
	allowlistPath: string,
	declarationProblems: string[] = [],
): Applied {
	const suppressed: Finding[] = [];
	const surviving: Finding[] = [];
	const used = new Set<string>();

	for (const item of findings) {
		if (allowlist.waivers[item.rule]?.paths.includes(item.path) === true) {
			suppressed.push(item);
			used.add(`${item.rule} ${item.path}`);
			continue;
		}
		surviving.push(item);
	}

	const stale = (rule: RuleId, message: string): Finding => ({
		line: 0,
		message,
		path: allowlistPath,
		rule,
	});

	const examined = new Set(gates.map((gate) => gate.path));
	for (const rule of STATIC_RULES) {
		const waiver = allowlist.waivers[rule];
		if (waiver === undefined) continue;
		for (const path of waiver.paths) {
			if (!examined.has(path)) {
				surviving.push(
					stale(rule, `waives ${rule} for ${path}, which is no longer a gate.`),
				);
				continue;
			}
			if (used.has(`${rule} ${path}`)) continue;
			surviving.push(
				stale(rule, `waives ${rule} for ${path}, which now passes ${rule}. Remove it.`),
			);
		}
	}
	for (const path of Object.keys(allowlist.excluded)) {
		if (allPaths.has(path)) continue;
		surviving.push(
			stale('GC1', `excludes ${path}, which no \`check*\` task reaches. Remove it.`),
		);
	}
	for (const problem of declarationProblems) {
		surviving.push(stale('GC1', problem));
	}

	return { suppressed, surviving };
}
