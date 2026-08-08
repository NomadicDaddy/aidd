/**
 * Resolve the gate population from package.json.
 *
 * A gate is a TypeScript file that a `check*` task runs, or that a task the repository has
 * explicitly DECLARED a gate runs. The first half is deliberately mechanical: the alternative -- a
 * hand-maintained list of gates -- is the exact failure mode this subsystem exists to end, because
 * a list goes stale the first time somebody adds a task and forgets it.
 *
 * The second half exists because the first half was measured and found short. `check*` is a naming
 * convention, and four tasks across the two repositories that run this file assert about their
 * repository and fail the build without obeying it: `verify-compression`, `verify-minification`
 * and `config:validate` in spernakit, `release:check` and `verify-minification` in aidd. The
 * meta-gate reported `35 gates examined` and the number was true and
 * incomplete, which is rule 5's own defect one level up -- a pass over the wrong population rather
 * than over the wrong items. Widening the regex would only move the boundary to a different set of
 * words; the declaration is a map of task name to reason in the allowlist, held honest the same way
 * every other entry there is, by a staleness finding when it stops describing anything.
 *
 * Composite tasks are followed one reference at a time, so `check:licenses`, which runs
 * `bun run check:license-core && bun scripts/generate-third-party-licenses.ts --check`, contributes
 * both files. Non-TypeScript targets are not gates for this purpose; a `.sh` guard has none of the
 * eight rules' surfaces. Files that are reached only as a shim (`run-bash.ts`) or as a dispatcher
 * shared with non-gate tasks are removed by the allowlist's `excluded` map, with a reason each.
 */

/** Any `scripts/...ts` path appearing as a command argument. */
const SCRIPT_PATH = /(?:^|\s)(?:\.\/)?(scripts\/[A-Za-z0-9._/-]+\.ts)/g;

/** A `bun run <task>` reference to another package.json script. */
const TASK_REFERENCE = /\bbun run ([A-Za-z0-9:_-]+)/g;

/** Task names that declare a gate by convention. `check-application`, `check:drift`, and a bare `check`. */
const GATE_TASK = /^check(?:[:-].+)?$/;

/** Whether a task name declares a gate, by convention or by explicit declaration. */
function isGateTask(task: string, declared: ReadonlySet<string>): boolean {
	return GATE_TASK.test(task) || declared.has(task);
}

export interface DiscoveredGate {
	/** Repo-relative, forward slashes. */
	path: string;
	/** The gate tasks that reach this file, sorted and deduplicated. */
	tasks: string[];
}

function collect(
	task: string,
	scripts: Record<string, string>,
	seen: Set<string>,
	into: Map<string, Set<string>>,
	origin: string,
): void {
	if (seen.has(task)) return;
	seen.add(task);
	const command = scripts[task];
	if (command === undefined) return;

	for (const match of command.matchAll(SCRIPT_PATH)) {
		const path = match[1]!;
		const tasks = into.get(path) ?? new Set<string>();
		tasks.add(origin);
		into.set(path, tasks);
	}
	for (const match of command.matchAll(TASK_REFERENCE)) {
		collect(match[1]!, scripts, seen, into, origin);
	}
}

function readScripts(packageJsonText: string): Record<string, string> {
	const parsed: unknown = JSON.parse(packageJsonText);
	const scripts = (parsed as { scripts?: Record<string, string> }).scripts;
	if (scripts === undefined) {
		throw new Error('package.json has no "scripts" object; cannot resolve the gate population');
	}
	return scripts;
}

/**
 * Every TypeScript file reachable from a gate task, with the tasks that reach it.
 *
 * `declared` names tasks the repository has declared gates despite not matching `check*`; pass the
 * keys of the allowlist's `gates` map. Declarations only add to the population -- there is no way
 * to declare a `check*` task NOT a gate here, because that is what the allowlist's `excluded` map
 * already does, one file at a time and with a reason.
 *
 * Throws on a package.json with no `scripts` object rather than reporting an empty population:
 * zero gates and "this file is not a package manifest" are different states, and only one of them
 * is a finding.
 */
export function discoverGates(
	packageJsonText: string,
	declared: Iterable<string> = [],
): DiscoveredGate[] {
	const scripts = readScripts(packageJsonText);
	const declaredTasks = new Set(declared);

	const into = new Map<string, Set<string>>();
	for (const task of Object.keys(scripts)) {
		if (!isGateTask(task, declaredTasks)) continue;
		collect(task, scripts, new Set(), into, task);
	}

	return [...into.entries()]
		.map(([path, tasks]) => ({ path, tasks: [...tasks].sort() }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Declarations that have stopped describing anything, as one message each.
 *
 * A declaration is the one hand-maintained part of the population, so it gets the same staleness
 * treatment every other hand-maintained entry in the allowlist gets. Three ways to go stale: the
 * task was renamed or deleted, the task was renamed INTO the `check*` convention so the
 * declaration is now redundant, and the task no longer runs a TypeScript file so declaring it adds
 * no gate. Each is silent otherwise, and each leaves a reason on disk describing a gate nobody can
 * find.
 */
export function staleDeclarations(packageJsonText: string, declared: Iterable<string>): string[] {
	const scripts = readScripts(packageJsonText);
	const stale: string[] = [];

	for (const task of declared) {
		if (scripts[task] === undefined) {
			stale.push(`declares "${task}" a gate, but package.json has no such task. Remove it.`);
			continue;
		}
		if (GATE_TASK.test(task)) {
			stale.push(
				`declares "${task}" a gate, but the name already matches the check* convention, ` +
					'so the declaration adds nothing. Remove it.',
			);
			continue;
		}
		const into = new Map<string, Set<string>>();
		collect(task, scripts, new Set(), into, task);
		if (into.size === 0) {
			stale.push(`declares "${task}" a gate, but it runs no TypeScript file. Remove it.`);
		}
	}

	return stale;
}
