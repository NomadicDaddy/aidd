import { describe, expect, test } from 'bun:test';

import type { AuditService } from '../../backend/src/services/auditService.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { RecipeService } from '../../backend/src/services/recipeService.ts';
import type { SkillService } from '../../backend/src/services/skillService.ts';

import { ScheduledTaskValidator } from '../../backend/src/services/scheduled/validator.ts';

const FLEET_DIR = 'D:/applications';

function validator() {
	const projectService = {
		listProjects: async () => ({
			projects: [
				{ name: 'One', path: 'D:\\one' },
				{ name: 'Two', path: 'D:\\two' },
			],
		}),
		resolveProjectPath: async (path: string) => path.replaceAll('\\', '/'),
	} as unknown as ProjectService;
	const recipeService = {
		readRecipe: async (id: string) => {
			if (id === 'missing') throw new Error('Recipe not found');
			return {
				id,
				metadataOnly: id === 'metadata-only',
				name: id,
				parameters: [{ name: 'required' }],
				steps: [],
			};
		},
	} as unknown as RecipeService;
	const skillService = {
		readSkill: async (id: string) => {
			if (id === 'missing') throw new Error('Skill not found');
			return { id };
		},
	} as unknown as SkillService;
	const auditService = {
		readAuditDefinition: async (name: string) => {
			if (name === 'MISSING') throw new Error('Audit not found');
			return { name };
		},
	} as unknown as AuditService;
	return new ScheduledTaskValidator(
		projectService,
		recipeService,
		skillService,
		auditService,
		() => FLEET_DIR,
	);
}

const schedule = { expression: '0 9 * * *', kind: 'cron' as const, timezone: 'UTC' };

describe('scheduled task validation', () => {
	test('defaults can save a review-only skill but mutating skills need confirmation', async () => {
		const service = validator();
		await expect(
			service.resolveWrite({
				name: 'Review',
				projects: ['D:/project'],
				schedule,
				target: {
					args: '--check',
					executionIntent: 'review-only',
					skillId: 'skill',
					type: 'skill',
				},
			}),
		).resolves.toMatchObject({ projects: ['D:/project'] });
		await expect(
			service.resolveWrite({
				name: 'Apply',
				projects: ['D:/project'],
				schedule,
				target: {
					args: '',
					executionIntent: 'apply-changes',
					skillId: 'skill',
					type: 'skill',
				},
			}),
		).rejects.toThrow('Confirm unattended changes');
	});

	test('stores an empty selection as all projects and resolves current paths for dispatch', async () => {
		const service = validator();
		await expect(
			service.resolveWrite({
				name: 'Every project',
				projects: [],
				schedule,
				target: {
					args: '',
					executionIntent: 'review-only',
					skillId: 'skill',
					type: 'skill',
				},
			}),
		).resolves.toMatchObject({ projects: [] });
		await expect(service.resolveDispatchProjects([])).resolves.toEqual(['D:/one', 'D:/two']);
	});

	test('keeps a no-project skill task free of projects and refuses per-project targets', async () => {
		const service = validator();
		await expect(
			service.resolveWrite({
				confirmUnattendedMutation: true,
				name: 'Development diary',
				// Paths left over from a scope switch must not survive the save.
				projects: ['D:\\one'],
				projectScope: 'none',
				schedule,
				target: {
					args: '',
					executionIntent: 'apply-changes',
					skillId: 'devdiary-update',
					type: 'skill',
				},
			}),
		).resolves.toMatchObject({ projects: [], projectScope: 'none' });
		await expect(
			service.resolveWrite({
				confirmUnattendedMutation: true,
				name: 'Fleet audit',
				projects: [],
				projectScope: 'none',
				schedule,
				target: { auditAll: true, auditNames: [], review: false, type: 'audit' },
			}),
		).rejects.toThrow('Audits run against a project');
		await expect(
			service.resolveWrite({
				confirmUnattendedMutation: true,
				name: 'Fleet metadata',
				projects: [],
				projectScope: 'none',
				schedule,
				target: {
					applyChanges: true,
					parameters: { required: 'value' },
					recipeId: 'metadata-only',
					type: 'recipe',
				},
			}),
		).rejects.toThrow('Metadata-only recipes run against a project');
	});

	test('rejects an explicit scope with nothing selected', async () => {
		await expect(
			validator().resolveWrite({
				name: 'Nothing selected',
				projects: [],
				projectScope: 'explicit',
				schedule,
				target: {
					args: '',
					executionIntent: 'review-only',
					skillId: 'skill',
					type: 'skill',
				},
			}),
		).rejects.toThrow('Select at least one project');
	});

	test('requires recipe mutation acknowledgement, confirmation, and parameters', async () => {
		const service = validator();
		const input = {
			name: 'Recipe',
			projects: ['D:/project'],
			schedule,
			target: {
				applyChanges: true,
				parameters: { required: 'value' },
				recipeId: 'recipe',
				type: 'recipe' as const,
			},
		};
		await expect(service.resolveWrite(input)).rejects.toThrow('Confirm unattended changes');
		await expect(
			service.resolveWrite({
				...input,
				confirmUnattendedMutation: true,
				target: { ...input.target, applyChanges: false },
			}),
		).rejects.toThrow('must be marked as allowed');
		await expect(
			service.resolveWrite({ ...input, confirmUnattendedMutation: true }),
		).resolves.toMatchObject({ target: { recipeId: 'recipe' } });
		await expect(
			service.resolveWrite({
				...input,
				confirmUnattendedMutation: true,
				target: { ...input.target, parameters: {} },
			}),
		).rejects.toThrow('Missing required recipe parameter');
	});

	test('revalidates missing skill, recipe, and audit catalog entries', async () => {
		const service = validator();
		await expect(
			service.validateTarget(
				{ args: '', executionIntent: 'review-only', skillId: 'missing', type: 'skill' },
				false,
			),
		).rejects.toThrow('Skill not found');
		await expect(
			service.validateTarget(
				{ auditAll: false, auditNames: ['MISSING'], review: true, type: 'audit' },
				false,
			),
		).rejects.toThrow('Audit not found');
		await expect(
			service.validateTarget(
				{ auditAll: true, auditNames: [], review: false, type: 'audit' },
				false,
			),
		).rejects.toThrow('Confirm unattended changes');
	});

	test('rejects unsafe or unpersistable launch overrides', async () => {
		const service = validator();
		const target = {
			args: '',
			executionIntent: 'review-only' as const,
			skillId: 'skill',
			type: 'skill' as const,
		};
		await expect(
			service.validateTarget(
				{ ...target, launchTarget: { model: 'model with spaces' } },
				false,
			),
		).rejects.toThrow('Invalid model override');
		await expect(
			service.validateTarget({ ...target, launchTarget: { reasoningEffort: 'max' } }, false),
		).rejects.toThrow('Invalid reasoning effort');
	});

	// The guard exists to keep shell metacharacters out of an argv the operator supplies, and an
	// underscore is not one. Rejecting it turned every quantized local model into a 400 that read
	// like the operator had mistyped the name.
	test('accepts a quantized model tag', async () => {
		await expect(
			validator().validateTarget(
				{
					args: '',
					executionIntent: 'review-only',
					launchTarget: { model: 'llama3.1:8b-instruct-q4_K_M' },
					skillId: 'skill',
					type: 'skill',
				},
				false,
			),
		).resolves.toBeUndefined();
	});
});
