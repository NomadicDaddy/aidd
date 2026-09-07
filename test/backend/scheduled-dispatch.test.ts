import { describe, expect, test } from 'bun:test';

import type { AuditService } from '../../backend/src/services/auditService.ts';
import type { PipelineService } from '../../backend/src/services/pipelineService.ts';
import type { SkillLaunchService } from '../../backend/src/services/skillLaunchService.ts';

import { ScheduledTaskDispatcher } from '../../backend/src/services/scheduled/dispatch.ts';

const FLEET_DIR = 'D:/applications';

function dispatcher(input: {
	audit?: AuditService;
	pipeline?: PipelineService;
	skill?: SkillLaunchService;
}) {
	return new ScheduledTaskDispatcher(
		input.audit ??
			({
				launchAuditsForPaths: async () => ({ failures: [], runIds: [] }),
			} as unknown as AuditService),
		input.pipeline ??
			({
				launchRecipe: async () => ({ id: 'session', status: 'queued' }),
			} as unknown as PipelineService),
		input.skill ??
			({
				launchSkill: async () => ({ id: 'skill-session', status: 'queued' }),
			} as unknown as SkillLaunchService),
		() => FLEET_DIR,
	);
}

describe('scheduled target dispatch', () => {
	test('fans recipe projects out sequentially and keeps partial launch failures', async () => {
		const calls: {
			executionId: string | undefined;
			projectDir: string;
			source: string | undefined;
		}[] = [];
		const pipeline = {
			launchRecipe: async (input: {
				projectDir: string;
				scheduledTaskExecutionId?: string;
				source?: string;
			}) => {
				calls.push({
					executionId: input.scheduledTaskExecutionId,
					projectDir: input.projectDir,
					source: input.source,
				});
				if (input.projectDir === 'D:/two') throw new Error('run ceiling reached');
				return { id: `session-${calls.length}`, status: 'queued' };
			},
		} as unknown as PipelineService;
		const result = await dispatcher({ pipeline }).dispatch({
			executionId: 'execution',
			projectPaths: ['D:/one', 'D:/two', 'D:/three'],
			scope: 'all',
			target: { applyChanges: true, recipeId: 'recipe', type: 'recipe' },
			trigger: 'scheduled',
		});

		expect(calls.map((call) => call.projectDir)).toEqual(['D:/one', 'D:/two', 'D:/three']);
		expect(calls.every((call) => call.source === 'scheduled')).toBe(true);
		expect(calls.every((call) => call.executionId === 'execution')).toBe(true);
		expect(result.children.map((child) => child.projectPath)).toEqual(['D:/one', 'D:/three']);
		expect(result.errors[0]).toContain('D:/two: run ceiling reached');
	});

	test('carries skill arguments, intent, overrides, and provenance', async () => {
		let received: Record<string, unknown> = {};
		const skill = {
			launchSkill: async (input: Record<string, unknown>) => {
				received = input;
				return { id: 'skill-session', status: 'queued' };
			},
		} as unknown as SkillLaunchService;
		const result = await dispatcher({ skill }).dispatch({
			executionId: 'execution',
			projectPaths: ['D:/project'],
			scope: 'explicit',
			target: {
				args: '--include-completed',
				executionIntent: 'review-only',
				launchTarget: { backend: 'codex', model: 'gpt-5' },
				skillId: 'diary-entry',
				type: 'skill',
			},
			trigger: 'scheduled',
		});
		expect(received).toMatchObject({
			args: '--include-completed',
			backend: 'codex',
			executionIntent: 'review-only',
			model: 'gpt-5',
			scheduledTaskExecutionId: 'execution',
			source: 'scheduled',
		});
		expect(result.children).toEqual([
			{ id: 'skill-session', projectPath: 'D:/project', status: 'queued', type: 'session' },
		]);
	});

	test('records audit run children and project-level failures', async () => {
		const audit = {
			launchAuditsForPaths: async () => ({
				failures: ['D:/project: unavailable'],
				runIds: ['run-1'],
			}),
		} as unknown as AuditService;
		const result = await dispatcher({ audit }).dispatch({
			executionId: 'execution',
			projectPaths: ['D:/project'],
			scope: 'explicit',
			target: { auditAll: true, auditNames: [], review: true, type: 'audit' },
			trigger: 'scheduled',
		});
		expect(result).toEqual({
			children: [{ id: 'run-1', projectPath: 'D:/project', status: 'running', type: 'run' }],
			errors: ['D:/project: unavailable'],
		});
	});

	test('launches a no-project task once from the applications root', async () => {
		const dirs: string[] = [];
		const skill = {
			launchSkill: async (input: { projectDir: string }) => {
				dirs.push(input.projectDir);
				return { id: 'diary-session', status: 'queued' };
			},
		} as unknown as SkillLaunchService;
		const result = await dispatcher({ skill }).dispatch({
			executionId: 'execution',
			// The runtime resolves nothing for this scope, but a stray path must not fan it out.
			projectPaths: ['D:/one', 'D:/two'],
			scope: 'none',
			target: {
				args: '',
				executionIntent: 'apply-changes',
				skillId: 'devdiary-update',
				type: 'skill',
			},
			trigger: 'scheduled',
		});
		expect(dirs).toEqual([FLEET_DIR]);
		expect(result.children).toEqual([
			{ id: 'diary-session', projectPath: null, status: 'queued', type: 'session' },
		]);
	});

	test('reports a no-project failure without a project prefix', async () => {
		const skill = {
			launchSkill: async () => {
				throw new Error('run ceiling reached');
			},
		} as unknown as SkillLaunchService;
		const result = await dispatcher({ skill }).dispatch({
			executionId: 'execution',
			projectPaths: [],
			scope: 'none',
			target: {
				args: '',
				executionIntent: 'apply-changes',
				skillId: 'devdiary-update',
				type: 'skill',
			},
			trigger: 'scheduled',
		});
		expect(result.children).toEqual([]);
		expect(result.errors).toEqual(['run ceiling reached']);
	});
});

describe('scheduled dispatch availability', () => {
	const skillTarget = {
		args: '',
		executionIntent: 'apply-changes',
		skillId: 'devdiary-update',
		type: 'skill',
	} as const;

	test('dispatches a due occurrence without an account or key', async () => {
		const dirs: string[] = [];
		const skill = {
			launchSkill: async (input: { projectDir: string }) => {
				dirs.push(input.projectDir);
				return { id: 'skill-session', status: 'queued' };
			},
		} as unknown as SkillLaunchService;
		const result = await dispatcher({ skill }).dispatch({
			executionId: 'execution',
			projectPaths: ['D:/project'],
			scope: 'explicit',
			target: skillTarget,
			trigger: 'scheduled',
		});
		expect(dirs).toEqual(['D:/project']);
		expect(result).toMatchObject({ errors: [] });
	});

	test('starts an automatic Director cycle without an account or key', async () => {
		const dispatched: string[] = [];
		const dispatcherWithCycle = dispatcher({});
		dispatcherWithCycle.setDirectorCycleLauncher(async (executionId) => {
			dispatched.push(executionId);
			return { cycleId: 'cycle-1' };
		});
		const result = await dispatcherWithCycle.dispatch({
			executionId: 'execution',
			projectPaths: [],
			scope: 'none',
			target: { type: 'director' },
			trigger: 'scheduled',
		});
		expect(dispatched).toEqual(['execution']);
		expect(result.children).toEqual([
			{ id: 'cycle-1', projectPath: null, status: 'running', type: 'cycle' },
		]);
	});

	test('dispatches a catch-up occurrence without an account or key', async () => {
		const dirs: string[] = [];
		const skill = {
			launchSkill: async (input: { projectDir: string }) => {
				dirs.push(input.projectDir);
				return { id: 'skill-session', status: 'queued' };
			},
		} as unknown as SkillLaunchService;
		const result = await dispatcher({ skill }).dispatch({
			executionId: 'execution',
			projectPaths: ['D:/project'],
			scope: 'explicit',
			target: skillTarget,
			trigger: 'catch_up',
		});
		expect(dirs).toEqual(['D:/project']);
		expect(result.children).toEqual([
			{ id: 'skill-session', projectPath: 'D:/project', status: 'queued', type: 'session' },
		]);
		expect(result.errors).toEqual([]);
	});
});

type DispatchInput = Parameters<ScheduledTaskDispatcher['dispatch']>[0];

/**
 * One trigger, one answer, threaded to everything the occurrence starts.
 *
 * The defect these pin: the scheduler correctly recognised a Run now, then dropped the trigger on
 * the way to the launchers, so every run, session, and cycle it started was filed as aidd's own work
 * rather than the operator's. Downstream that reached the suggestion auto-launcher, which trusts
 * the cycle's initiator and would have started follow-on work off the back of a button somebody
 * pressed while watching.
 *
 * These tests keep provenance aligned across all four launch surfaces.
 */
async function initiatorSeenBy(
	target: DispatchInput['target'],
	trigger: DispatchInput['trigger'],
): Promise<unknown> {
	const seen: unknown[] = [];
	const captureSession = async (input: { initiator?: unknown }) => {
		seen.push(input.initiator);
		return { id: 'session', status: 'queued' };
	};
	const instance = dispatcher({
		audit: {
			launchAuditsForPaths: async (input: { initiator?: unknown }) => {
				seen.push(input.initiator);
				return { failures: [], runIds: ['run-1'] };
			},
		} as unknown as AuditService,
		pipeline: { launchRecipe: captureSession } as unknown as PipelineService,
		skill: { launchSkill: captureSession } as unknown as SkillLaunchService,
	});
	instance.setDirectorCycleLauncher(async (_executionId, initiator) => {
		seen.push(initiator);
		return { cycleId: 'cycle-1' };
	});
	await instance.dispatch({
		executionId: 'execution',
		projectPaths: ['D:/project'],
		scope: 'explicit',
		target,
		trigger,
	});
	return seen[0];
}

const DISPATCH_TARGETS: { label: string; target: DispatchInput['target'] }[] = [
	{ label: 'the Director cycle', target: { type: 'director' } },
	{ label: 'a recipe', target: { applyChanges: true, recipeId: 'recipe', type: 'recipe' } },
	{
		label: 'a skill',
		target: {
			args: '',
			executionIntent: 'review-only',
			skillId: 'diary-entry',
			type: 'skill',
		},
	},
	{
		label: 'an audit sweep',
		target: { auditAll: true, auditNames: [], review: false, type: 'audit' },
	},
];

describe('the initiator a scheduled occurrence stamps on its work', () => {
	for (const { label, target } of DISPATCH_TARGETS) {
		test(`Run now on ${label} is the operator's work`, async () => {
			expect(await initiatorSeenBy(target, 'manual')).toBe('operator');
		});

		test(`the timer firing on ${label} is aidd's own`, async () => {
			expect(await initiatorSeenBy(target, 'scheduled')).toBe('automatic');
		});
	}

	test('a catch-up sweep is aidd deciding, because nobody asked for it', async () => {
		// Work that came due while aidd was not running. It reaches the same launchers a Run now
		// does, and must not borrow the operator's name on the way.
		expect(await initiatorSeenBy({ type: 'director' }, 'catch_up')).toBe('automatic');
	});

	test('Run now is recorded as the person who pressed it', async () => {
		expect(await initiatorSeenBy({ type: 'director' }, 'manual')).toBe('operator');
	});
});
