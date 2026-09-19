import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { stripComments } from '../_helpers/source-scan.ts';

const BACKEND_SRC = resolve(import.meta.dir, '../../backend/src');

/**
 * The initiator is only trustworthy if it is decided where the launch happens. The launch input
 * types make the field required, so the compiler already stops a launch path from omitting it — what
 * the compiler cannot catch is a site that names the wrong value, or a new launch path that copies a
 * neighbouring line without anybody deciding. This inventory pins the answer at each site so either
 * change has to be made deliberately, and the completeness check below fails on a site nobody added
 * here.
 *
 * The net is drawn around sessions as well as runs. A scheduled recipe, skill, or audit reaches a
 * run through a pipeline session, and for a while the session end of that chain re-derived the
 * answer from `source` — which cannot tell a Run now apart from the timer firing, and so filed a
 * person's work as aidd's. Item 3 of `.aidd/features/run-trigger-provenance/feature.json` asks for
 * the value to be set at every launch site rather than derived downstream; a fence watching only
 * `launchRun` could not see the half of the chain where that went wrong.
 */
const DECIDES: { expects: string; file: string; why: string }[] = [
	{
		expects: "initiator: 'operator'",
		file: 'routes/audits.ts',
		why: 'the audits page Run button; the request body never says who pressed it',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/projectInitFailures.ts',
		why: 'retrying a failed project init is a person clicking retry',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/projectMaturity.ts',
		why: 'an audit or skill invoked from the maturity panel',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/projects.ts',
		why: 'project creation and implementation launches, both operator-driven',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/recipes.ts',
		why: 'the recipe Launch button',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/runs.ts',
		why: 'the web Launch button AND every MCP launch_run, which proxies to this one route',
	},
	{
		expects: "initiator: 'operator'",
		file: 'routes/skills.ts',
		why: 'the skill Run button',
	},
	{
		expects: 'initiator,',
		file: 'services/director/cycleExecutor.ts',
		why: 'threaded from the cycle entry point: Run Cycle is operator, the sweep is automatic',
	},
	{
		expects: "initiator: RunInitiator = 'operator'",
		file: 'services/director/suggestionService.ts',
		why: 'a person clicking Launch unless the auto-launcher says otherwise; the default is the answer',
	},
	{
		expects: "initiator: 'operator'",
		file: 'services/directorService.ts',
		why: 'the chat agent is a proxy for a person who asked a moment ago',
	},
	{
		expects: 'asRunInitiator(input.session.initiator) ??',
		file: 'services/pipeline/launchService.ts',
		why: 'records the launcher answer on the session, and owns the only fallback there is: a session written before the column existed',
	},
	{
		expects: 'initiator }',
		file: 'services/runService.ts',
		why: 'the continuation seam threads the caller value through rather than choosing one',
	},
	{
		expects: "trigger === 'manual' ? 'operator' : 'automatic'",
		file: 'services/scheduled/dispatch.ts',
		why: 'the one derivation the trigger permits, so every launch records Run now consistently',
	},
];

/**
 * Files that touch a launch but deliberately do not answer the question. A launch path is allowed to
 * forward somebody else's answer; what it is not allowed to do is quietly supply one of its own,
 * which is what the assertion below actually checks. Listing them is what makes "Director chat is
 * operator", "MCP is operator", and "a scheduled occurrence's runs are the occurrence's" checkable
 * facts rather than literals scattered where nobody looks.
 */
const DELEGATES: { file: string; why: string }[] = [
	{
		file: 'services/audit/launchAuditsImpl.ts',
		why: 'stamps `input.initiator` rather than deriving from `source`, which cannot see a Run now',
	},
	{
		file: 'services/auditService.ts',
		why: 'forwards the whole options object it was handed, choosing nothing',
	},
	{
		file: 'services/director/chatAgentTools/dispatch.ts',
		why: 'the chat tool calls the context method; the wiring names the initiator',
	},
	{
		file: 'services/director/chatAgentTools/types.ts',
		why: 'declares that context method and no initiator, so a tool cannot invent one',
	},
	{
		file: 'services/directiveLaunchService.ts',
		why: 'the one place a directive becomes a run; it stamps the caller answer, so the Directive button stays operator and a scheduled occurrence keeps the trigger it derived',
	},
	{
		file: 'services/pipeline/autoFixRunner.ts',
		why: 'an auto-fix inherits the session it is fixing, read from the execution context',
	},
	{
		file: 'services/pipeline/managedStepHandler.ts',
		why: 'a managed step inherits the session it belongs to, read from the execution context',
	},
	{
		file: 'services/pipelineService.ts',
		why: 'the facade; it hands the input on untouched',
	},
	{
		file: 'services/project/create.ts',
		why: 'calls the launcher the route injected, already carrying the route answer',
	},
	{
		file: 'services/project/implementation.ts',
		why: 'calls the launcher the route injected, already carrying the route answer',
	},
	{
		file: 'services/run/launch.ts',
		why: 'the launcher itself; its options type makes the field required for every caller',
	},
	{
		file: 'services/skillLaunchService.ts',
		why: 'wraps a skill as a recipe launch and passes the caller answer straight through',
	},
];

function backendSourceFiles(dir: string = BACKEND_SRC): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...backendSourceFiles(full));
		else if (entry.name.endsWith('.ts')) found.push(full);
	}
	return found;
}

// Sessions as well as runs: a scheduled recipe, skill, or audit becomes runs only after a session
// has already had to answer the question, so the session launchers belong inside the fence too. A
// directive is the one target that reaches a run without a session, so its launcher is named here
// too rather than being visible only through the `launchRun` call inside it.
const LAUNCH_CALLS =
	/launchRun\(|launchRecipe\(|launchSkill\(|launchAudits\(|launchAuditsForPaths\(|launchDirective\(/;

/** Every backend file that calls or declares a run or session launch. */
function filesTouchingLaunches(): string[] {
	const hits: string[] = [];
	for (const file of backendSourceFiles()) {
		if (LAUNCH_CALLS.test(readFileSync(file, 'utf8'))) {
			hits.push(relative(BACKEND_SRC, file).replaceAll('\\', '/'));
		}
	}
	return hits.sort();
}

describe('run initiator launch sites', () => {
	test('every launch path either names an initiator or provably forwards one', () => {
		// A new launch path shows up here as a failure rather than as a run whose provenance is a
		// guess, which is the outcome the whole feature exists to prevent.
		const inventory = [...DECIDES.map((site) => site.file), ...DELEGATES.map((s) => s.file)];
		expect(filesTouchingLaunches()).toEqual([...new Set(inventory)].sort());

		for (const site of DECIDES) {
			expect(readFileSync(join(BACKEND_SRC, site.file), 'utf8')).toContain(site.expects);
		}
	});

	test('no delegate quietly chooses', () => {
		// Forwarding is safe; naming a value is a second answer nobody decided to give, and a
		// literal is exactly what a line copied from a neighbouring launch site looks like. Its
		// absence is therefore the property worth pinning, and it needs no bookkeeping about which
		// file answers for which.
		for (const site of DELEGATES) {
			const source = stripComments(readFileSync(join(BACKEND_SRC, site.file), 'utf8'));
			expect(source).not.toContain("initiator: 'operator'");
			expect(source).not.toContain("initiator: 'automatic'");
		}
	});

	test('the launcher makes the field required, so nothing above it can stay silent', () => {
		// The terminus of every chain above. If this stops being required, every delegate becomes
		// free to omit the field and the compiler stops asking on their behalf.
		expect(readFileSync(join(BACKEND_SRC, 'services/run/launch.ts'), 'utf8')).toContain(
			'initiator: RunInitiator;',
		);
	});
});
