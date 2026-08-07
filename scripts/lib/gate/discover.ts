/**
 * Resolve the gate population from package.json.
 *
 * A gate is a TypeScript file that a `check*` task runs. That definition is deliberately mechanical:
 * the alternative -- a hand-maintained list of gates -- is the exact failure mode this subsystem
 * exists to end, because a list goes stale the first time somebody adds a task and forgets it.
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

/** Task names that declare a gate. `check-application`, `check:drift`, and a bare `check`. */
const GATE_TASK = /^check(?:[:-].+)?$/;

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

/**
 * Every TypeScript file reachable from a `check*` task, with the tasks that reach it.
 *
 * Throws on a package.json with no `scripts` object rather than reporting an empty population:
 * zero gates and "this file is not a package manifest" are different states, and only one of them
 * is a finding.
 */
export function discoverGates(packageJsonText: string): DiscoveredGate[] {
	const parsed: unknown = JSON.parse(packageJsonText);
	const scripts = (parsed as { scripts?: Record<string, string> }).scripts;
	if (scripts === undefined) {
		throw new Error('package.json has no "scripts" object; cannot resolve the gate population');
	}

	const into = new Map<string, Set<string>>();
	for (const task of Object.keys(scripts)) {
		if (!GATE_TASK.test(task)) continue;
		collect(task, scripts, new Set(), into, task);
	}

	return [...into.entries()]
		.map(([path, tasks]) => ({ path, tasks: [...tasks].sort() }))
		.sort((a, b) => a.path.localeCompare(b.path));
}
