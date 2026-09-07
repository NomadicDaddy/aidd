import { describe, expect, test } from 'bun:test';

import type { ResolvedDirectorSuggestionsAutoLaunchConfig } from 'aidd-shared/config/types';

import { resolveMergedConfig } from 'aidd-shared/config';

import type { SuggestionAutoLaunchDeps } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import type {
	AutoLaunchCandidate,
	AutoLaunchProjectFacts,
} from '../../backend/src/services/director/suggestionAutoLaunchBounds.ts';
import type { DirectorSuggestionLaunch } from '../../backend/src/services/director/suggestionService.ts';

import { autoLaunchCycleSuggestions } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import { SuggestionClaimLostError } from '../../backend/src/services/director/suggestionService.ts';

/**
 * The bounded suggestion decision inside Director autopilot.
 *
 * Item 9 of `.aidd/features/director-suggestion-auto-launch/feature.json` asks for every bound in
 * item 4 to block independently. Eligible suggestions launch without an account or key, while
 * the safety bounds continue to limit the blast radius.
 *
 * The launcher is exercised with every collaborator answered in memory. Its two neighbours are
 * covered where they live: that a manual Launch click stays free and stamps `operator`, and that
 * two racing launches produce exactly one run, are asserted in `director-launch.test.ts` against a
 * real database.
 */

const ON: ResolvedDirectorSuggestionsAutoLaunchConfig = {
	// One name, not the shipped three: the cases that matter are a recipe on the list and a recipe
	// off it, and a single-entry list makes 'tidy' below an off-list name rather than a typo.
	allowedRecipes: ['coding'],
	enabled: true,
	maxPerCycle: 1,
	maxRank: 1,
	riskCeiling: 'LOW',
};

const CLEAN: AutoLaunchProjectFacts = {
	dirtyFileCount: 0,
	hasActiveWork: false,
	path: 'D:/apps/sample-project',
};

function candidate(overrides: Partial<AutoLaunchCandidate> = {}): AutoLaunchCandidate {
	return {
		id: 'sug_1',
		projectId: 'sample-project',
		rank: 1,
		riskLevel: 'LOW',
		suggestedRecipe: null,
		title: 'Fix the thing',
		...overrides,
	};
}

interface HarnessOptions {
	config?: Partial<ResolvedDirectorSuggestionsAutoLaunchConfig>;
	dirtyTreeThreshold?: number;
	facts?: Partial<AutoLaunchProjectFacts>;
	launch?: (id: string) => Promise<DirectorSuggestionLaunch>;
	pending: AutoLaunchCandidate[];
}

/**
 * Every project a candidate names, registered with a path of its own.
 *
 * A registry holding one entry cannot tell the same-project bound from the per-cycle ceiling: two
 * suggestions would be refused by whichever bound happened to run first, whichever one the test
 * meant. Deriving the registry from the pending list is what lets "two projects" and "one project
 * named twice" be the only difference between two otherwise identical cases.
 */
function projectRegistry(pending: AutoLaunchCandidate[], path: null | string): Map<string, string> {
	if (path === null) return new Map();
	return new Map(
		pending
			.map((item) => item.projectId)
			.filter((id): id is string => id !== null)
			.map((id) => [id, id === 'sample-project' ? path : `D:/apps/${id}`]),
	);
}

/**
 * The launcher with every collaborator answered in memory: no database, no git, no run.
 */
function harness(options: HarnessOptions): { deps: SuggestionAutoLaunchDeps; launched: string[] } {
	const facts = { ...CLEAN, ...options.facts };
	const launched: string[] = [];
	const deps: SuggestionAutoLaunchDeps = {
		config: { ...ON, ...options.config },
		dirtyTreeThreshold: options.dirtyTreeThreshold ?? 50,
		hasActiveWorkForProject: async () => facts.hasActiveWork,
		launch:
			options.launch ??
			(async (id) => {
				launched.push(id);
				return { kind: 'run', runId: `run_${id}` };
			}),
		listPending: async () => options.pending,
		readDirtyFileCount: async () => facts.dirtyFileCount,
		resolveProjectPaths: async () => projectRegistry(options.pending, facts.path),
	};
	return { deps, launched };
}

describe('auto-launch is off unless an operator turns it on', () => {
	test('a config with no director block at all resolves no director config', () => {
		expect(resolveMergedConfig({}).director).toBeUndefined();
	});

	test('a director block that never mentions auto-launch resolves off, at the tightest bounds', () => {
		const resolved = resolveMergedConfig({ director: { suggestions: {} } }).director;
		expect(resolved?.suggestions.autoLaunch).toEqual({
			allowedRecipes: ['coding', 'remediate-audit-findings', 'remediate-bugs'],
			enabled: false,
			maxPerCycle: 1,
			maxRank: 1,
			riskCeiling: 'LOW',
		});
	});

	test('switched off, nothing is even considered', async () => {
		let asked = false;
		const { deps } = harness({ config: { enabled: false }, pending: [candidate()] });
		const outcome = await autoLaunchCycleSuggestions(
			{
				...deps,
				listPending: async () => {
					asked = true;
					return [];
				},
			},
			'cycle_1',
		);
		// null rather than an empty record: the column stays NULL, which reads as "never
		// considered" rather than "considered, and declined everything".
		expect(outcome).toBeNull();
		expect(asked).toBe(false);
	});
});

describe('every bound in item 4 blocks on its own', () => {
	async function skipCodesFor(options: HarnessOptions): Promise<string[]> {
		const { deps, launched } = harness(options);
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual([]);
		expect(outcome?.launched).toEqual([]);
		return (outcome?.skipped ?? []).map((skip) => skip.code);
	}

	test('a recipe that is not on the allow-list is left for a person', async () => {
		expect(await skipCodesFor({ pending: [candidate({ suggestedRecipe: 'tidy' })] })).toEqual([
			'recipe_backed',
		]);
	});

	test('a fleet-wide suggestion names no project to run in', async () => {
		expect(await skipCodesFor({ pending: [candidate({ projectId: null })] })).toEqual([
			'project_unavailable',
		]);
	});

	test('an unranked suggestion is never picked automatically', async () => {
		expect(await skipCodesFor({ pending: [candidate({ rank: null })] })).toEqual([
			'rank_ineligible',
		]);
	});

	test('a suggestion below the rank cutoff is skipped', async () => {
		expect(await skipCodesFor({ pending: [candidate({ rank: 2 })] })).toEqual([
			'rank_ineligible',
		]);
	});

	test('a suggestion above the risk ceiling is skipped', async () => {
		expect(await skipCodesFor({ pending: [candidate({ riskLevel: 'HIGH' })] })).toEqual([
			'risk_above_ceiling',
		]);
	});

	test('a risk level this build does not recognise sorts above every ceiling', async () => {
		expect(
			await skipCodesFor({
				config: { riskCeiling: 'HIGH' },
				pending: [candidate({ riskLevel: 'CATASTROPHIC' })],
			}),
		).toEqual(['risk_above_ceiling']);
	});

	test('an unregistered project is skipped rather than guessed at', async () => {
		expect(await skipCodesFor({ facts: { path: null }, pending: [candidate()] })).toEqual([
			'project_unavailable',
		]);
	});

	test('a project already at work — a run, or a session between steps — is left alone', async () => {
		expect(
			await skipCodesFor({ facts: { hasActiveWork: true }, pending: [candidate()] }),
		).toEqual(['active_run']);
	});

	test('a working tree dirtier than the threshold is skipped', async () => {
		expect(
			await skipCodesFor({
				dirtyTreeThreshold: 5,
				facts: { dirtyFileCount: 6 },
				pending: [candidate()],
			}),
		).toEqual(['dirty_tree']);
	});

	test('a working tree that could not be read is not treated as a clean one', async () => {
		expect(
			await skipCodesFor({ facts: { dirtyFileCount: null }, pending: [candidate()] }),
		).toEqual(['project_unavailable']);
	});

	test('maxPerCycle stops the second eligible suggestion', async () => {
		// Two projects on purpose. One project named twice is refused by the same-project bound
		// below, which would make this test pass without the ceiling existing at all.
		const { deps, launched } = harness({
			config: { maxPerCycle: 1, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['a']);
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'max_per_cycle'],
		]);
	});

	test('a dismissed suggestion never reaches the bounds at all', async () => {
		// Both `dismissedBy` kinds — an operator rejection and the routine cycle_retire sweep —
		// leave the row non-pending, and the launcher reads only pending rows. There is
		// deliberately no branch on the distinction, so the assertion is that nothing is seen.
		const { deps, launched } = harness({ pending: [] });
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual([]);
		expect(outcome).toEqual({ launched: [], skipped: [] });
	});
});

/**
 * The bound that decides how much a single automatic decision is allowed to set off.
 *
 * A recipe-backed suggestion starts a pipeline session, not a run: several steps, remediation of its
 * own, and as many runs as the recipe has stages. Every other bound in the file is written against
 * one run in one project and none of them can say anything about that, which is why the allow-list
 * carries it alone.
 *
 * It is an allow-list rather than a block-list because refusing on absence is also what makes a
 * recipe name the model invented safe: it simply is not in the list, and no lookup is needed to find
 * that out. `coding-native` appears 521 times in this install's own cycle output and matches no
 * recipe file at all.
 */
describe('the recipe allow-list bounds what one automatic decision sets off', () => {
	function sessionLauncher(): (id: string) => Promise<DirectorSuggestionLaunch> {
		return async (id) => ({ kind: 'pipeline', pipelineSessionId: `pipe_${id}` });
	}

	test('a recipe on the list starts a session, recorded as a session', async () => {
		const { deps } = harness({
			launch: sessionLauncher(),
			pending: [candidate({ suggestedRecipe: 'coding' })],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		// Recorded under its own kind, not folded into a run. The summary links a session to its
		// report and a run to the runs list, and it has nothing but this to tell them apart.
		expect(outcome?.launched).toEqual([
			{
				kind: 'pipeline',
				pipelineSessionId: 'pipe_sug_1',
				suggestionId: 'sug_1',
				title: 'Fix the thing',
			},
		]);
		expect(outcome?.skipped).toEqual([]);
	});

	test('a recipe name the model invented is refused without a lookup', async () => {
		// Nothing here reads the recipe catalogue. `coding-native` is refused for exactly the same
		// reason `project-intake` is: it is not on the list.
		const { deps, launched } = harness({
			pending: [candidate({ suggestedRecipe: 'coding-native' })],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual([]);
		expect(outcome?.skipped.map((skip) => skip.code)).toEqual(['recipe_backed']);
	});

	test('an empty allow-list means plain runs only', async () => {
		const { deps } = harness({
			config: { allowedRecipes: [] },
			pending: [candidate({ suggestedRecipe: 'coding' })],
		});
		expect(
			(await autoLaunchCycleSuggestions(deps, 'cycle_1'))?.skipped.map((s) => s.code),
		).toEqual(['recipe_backed']);
	});

	test('a suggestion naming no recipe is unaffected by the list', async () => {
		const { deps, launched } = harness({
			config: { allowedRecipes: [] },
			pending: [candidate()],
		});
		await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['sug_1']);
	});

	test('a session takes one of the cycle’s places, exactly as a run does', async () => {
		// The ceiling counts what actually started. A session that did not count would let one
		// cycle start `maxPerCycle` runs AND any number of multi-step sessions on top of them.
		const { deps } = harness({
			config: { maxPerCycle: 1, maxRank: 3 },
			launch: sessionLauncher(),
			pending: [
				candidate({
					id: 'a',
					projectId: 'sample-project',
					rank: 1,
					suggestedRecipe: 'coding',
				}),
				candidate({
					id: 'b',
					projectId: 'other-project',
					rank: 2,
					suggestedRecipe: 'coding',
				}),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'max_per_cycle'],
		]);
	});

	test('the allow-list remains authoritative for every installation', async () => {
		const pending = [candidate({ suggestedRecipe: 'project-intake' })];
		const outcome = await autoLaunchCycleSuggestions(harness({ pending }).deps, 'cycle_1');
		expect(outcome?.skipped.map((skip) => skip.code)).toEqual(['recipe_backed']);
	});
});

describe('eligible suggestions launch with no extra prerequisite', () => {
	test('an eligible suggestion launches and is recorded', async () => {
		const { deps, launched } = harness({ pending: [candidate()] });
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['sug_1']);
		expect(outcome?.launched).toEqual([
			{ kind: 'run', runId: 'run_sug_1', suggestionId: 'sug_1', title: 'Fix the thing' },
		]);
		expect(outcome?.skipped).toEqual([]);
	});

	test('a cycle whose suggestions are all out of bounds records the bound', async () => {
		const { deps } = harness({ pending: [candidate({ rank: 9 })] });
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.skipped.map((skip) => skip.code)).toEqual(['rank_ineligible']);
	});

	test('bounds and launches are both represented in rank order', async () => {
		const pending = [candidate({ id: 'a' }), candidate({ id: 'b', riskLevel: 'HIGH' })];
		const outcome = await autoLaunchCycleSuggestions(harness({ pending }).deps, 'cycle_1');
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'risk_above_ceiling'],
		]);
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
	});
});

describe('losing a race to a person is an ordinary outcome, not a failure', () => {
	test('a claim lost to a manual launch is recorded as a skip and raises nothing', async () => {
		const { deps } = harness({
			launch: () => {
				throw new SuggestionClaimLostError('Suggestion sug_1 is no longer pending.');
			},
			pending: [candidate()],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.launched).toEqual([]);
		expect(outcome?.skipped.map((skip) => skip.code)).toEqual(['claim_lost']);
	});

	test('a launch that fails for any other reason leaves the cycle standing', async () => {
		const { deps } = harness({
			launch: () => {
				throw new Error('the orchestrator refused');
			},
			pending: [candidate()],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.skipped.map((skip) => skip.code)).toEqual(['launch_failed']);
		expect(outcome?.skipped[0]?.reason).toContain('the orchestrator refused');
	});

	test('a collaborator failing outright is recorded rather than lost', async () => {
		const { deps } = harness({ pending: [candidate()] });
		const outcome = await autoLaunchCycleSuggestions(
			{
				...deps,
				listPending: () => {
					throw new Error('the suggestion query failed');
				},
			},
			'cycle_1',
		);
		// The cycle stands and the suggestions stay pending for a person, but the failure lands on
		// the record. Null is reserved for auto-launch being switched off — the one case an operator
		// caused themselves — so "a bound did its job" and "the launcher never got to ask" cannot
		// look identical to somebody reading the cycle afterwards.
		expect(outcome?.error).toContain('the suggestion query failed');
		expect(outcome?.launched).toEqual([]);
		expect(outcome?.skipped).toEqual([]);
	});
});

describe('one project holds one agent, whatever the ceiling allows', () => {
	// The active-run bound reads a project's state once, before this cycle has started anything, so
	// it cannot see the launches this same scan is about to make. Two suggestions naming one
	// repository both cleared it and both launched, putting two agents in one working tree. The
	// claim is taken when a candidate becomes eligible, which is what makes the launch loop unable
	// to breach the bound however its own arithmetic works out.

	test('two suggestions for one project launch one, and say why the other waits', async () => {
		const { deps, launched } = harness({
			config: { maxPerCycle: 2, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'sample-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		// The ceiling permits two. Only the project bound stops the second, and it is the
		// higher-ranked suggestion that gets the project.
		expect(launched).toEqual(['a']);
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'active_run'],
		]);
		// Reported under the active-run code because the fact an operator needs is the same one, so
		// the sentence has to carry which of the two ways the project is spoken for.
		expect(outcome?.skipped[0]?.reason).toContain('higher-ranked suggestion this cycle');
	});

	test('two suggestions for different projects both launch', async () => {
		// The other half of the bound: claiming a project must not turn the ceiling into one launch
		// per cycle everywhere.
		const { deps, launched } = harness({
			config: { maxPerCycle: 2, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['a', 'b']);
		expect(outcome?.skipped).toEqual([]);
	});

	test('the project claim holds before launch', async () => {
		const { deps } = harness({
			config: { maxPerCycle: 2, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'sample-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'active_run'],
		]);
	});
});

describe('the ceiling counts launches, not candidates considered', () => {
	// If quota were consumed while the eligible list was being built, a candidate that never
	// started anything would still spend one of the cycle's places, and a cycle could then record
	// "already launched its limit" against every lower-ranked suggestion while nothing at all was
	// running.

	function launcherRefusing(
		failing: string,
		error: Error,
	): { launch: (id: string) => Promise<DirectorSuggestionLaunch>; launched: string[] } {
		const launched: string[] = [];
		return {
			launch: async (id) => {
				if (id === failing) throw error;
				launched.push(id);
				return { kind: 'run', runId: `run_${id}` };
			},
			launched,
		};
	}

	test('a claim lost to a person gives its place to the next suggestion', async () => {
		const { launch, launched } = launcherRefusing(
			'a',
			new SuggestionClaimLostError('Suggestion a is no longer pending.'),
		);
		const { deps } = harness({
			config: { maxPerCycle: 1, maxRank: 3 },
			launch,
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		// The cycle's one place was never occupied, so 'b' takes it rather than being told the
		// cycle had launched its limit while nothing was running.
		expect(launched).toEqual(['b']);
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['b']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['a', 'claim_lost'],
		]);
	});

	test('a launch that fails outright also gives its place back', async () => {
		const { launch, launched } = launcherRefusing('a', new Error('the orchestrator refused'));
		const { deps } = harness({
			config: { maxPerCycle: 1, maxRank: 3 },
			launch,
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['b']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['a', 'launch_failed'],
		]);
	});

	test('the ceiling still holds when every launch succeeds', async () => {
		// The counting change must not become a way past the bound: three eligible candidates in
		// three projects, a ceiling of two, and exactly two launches.
		const { deps, launched } = harness({
			config: { maxPerCycle: 2, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
				candidate({ id: 'c', projectId: 'third-project', rank: 3 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(launched).toEqual(['a', 'b']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['c', 'max_per_cycle'],
		]);
	});

	test('the ceiling is reported after the available launch place is filled', async () => {
		const { deps } = harness({
			config: { maxPerCycle: 1, maxRank: 3 },
			pending: [
				candidate({ id: 'a', projectId: 'sample-project', rank: 1 }),
				candidate({ id: 'b', projectId: 'other-project', rank: 2 }),
			],
		});
		const outcome = await autoLaunchCycleSuggestions(deps, 'cycle_1');
		expect(outcome?.launched.map((item) => item.suggestionId)).toEqual(['a']);
		expect(outcome?.skipped.map((skip) => [skip.suggestionId, skip.code])).toEqual([
			['b', 'max_per_cycle'],
		]);
		expect(outcome?.skipped[0]?.reason).toContain('ceiling of 1');
	});
});
