import { describe, expect, test } from 'bun:test';
import { ArgsError, parseArgs } from 'aidd-shared/args/index';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import type { ResolvedConfig } from 'aidd-shared/config';
import { backendNames } from 'aidd-shared/plan/types';

const baseConfig: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: null,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 900,
	idleNudgeTimeoutSeconds: 600,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 30_000,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

function planFor(argv: string[], config: ResolvedConfig = baseConfig) {
	return resolveRunPlan(parseArgs(argv), config);
}

function fragmentIds(argv: string[]): string[] {
	return planFor(argv).prompt.fragments.map((fragment) => fragment.id);
}

describe('CLI use-case compatibility — top invocation shapes against aidd', () => {
	describe('1. default coding loop', () => {
		test('--project-dir + --spec resolves coding mode with phase=coding', () => {
			const plan = planFor(['--project-dir', 'd:/applications/demo', '--spec', './spec.md']);
			expect(plan.mode).toBe('coding');
			expect(plan.prompt.phase).toBe('coding');
			expect(plan.scope.kind).toBe('project');
			expect(plan.scope.specFile?.endsWith('spec.md')).toBe(true);
			expect(plan.audit).toBeUndefined();
		});
	});

	describe('2. CLI swap — every supported backend', () => {
		for (const backend of backendNames) {
			test(`--cli ${backend} parses and flows through to plan.backend`, () => {
				expect(parseArgs(['--cli', backend]).cli).toBe(backend);
				const plan = planFor(['--project-dir', '.', '--cli', backend], {
					...baseConfig,
					cli: backend,
				});
				expect(plan.backend).toBe(backend);
			});
		}
		test('rejects an unknown CLI', () => {
			expect(() => parseArgs(['--cli', 'not-a-cli'])).toThrow(ArgsError);
		});
	});

	describe('3. filtered coding by feature.json field', () => {
		test('--filter-by category --filter Backend produces a feature filter', () => {
			const plan = planFor([
				'--project-dir',
				'.',
				'--filter-by',
				'category',
				'--filter',
				'Backend',
			]);
			expect(plan.featureFilter).toEqual({ field: 'category', value: 'Backend' });
			expect(plan.scope.filters).toContainEqual({
				field: 'category',
				value: 'Backend',
			});
			expect(
				fragmentIds(['--project-dir', '.', '--filter-by', 'category', '--filter', 'B'])
			).toContain('feature-filter');
		});
		test('--filter-by without --filter is rejected', () => {
			expect(() => parseArgs(['--filter-by', 'status'])).toThrow(ArgsError);
		});
		test('unknown field is rejected', () => {
			expect(() => parseArgs(['--filter-by', 'nope', '--filter', 'x'])).toThrow(ArgsError);
		});
	});

	describe('4. milestone-scoped run', () => {
		test('--milestone MVP carries through plan.scope and prompt fragments', () => {
			const plan = planFor(['--project-dir', '.', '--milestone', 'MVP']);
			expect(plan.scope.milestone).toBe('MVP');
			expect(plan.prompt.milestone?.value).toBe('MVP');
			expect(fragmentIds(['--project-dir', '.', '--milestone', 'MVP'])).toContain(
				'milestone-filter'
			);
		});
	});

	describe('5. single-feature focus', () => {
		test('--feature pins prompt.featureFocus and scope', () => {
			const plan = planFor(['--project-dir', '.', '--feature', 'account-lockout']);
			expect(plan.scope.feature).toBe('account-lockout');
			expect(plan.prompt.featureFocus).toEqual({
				value: 'account-lockout',
				directory: 'account-lockout',
			});
			expect(fragmentIds(['--project-dir', '.', '--feature', 'account-lockout'])).toContain(
				'feature-focus'
			);
		});
	});

	describe('6. audit modes', () => {
		test('single audit registers in plan.audit', () => {
			const plan = planFor(['--project-dir', '.', '--audit', 'SECURITY']);
			expect(plan.mode).toBe('audit');
			expect(plan.audit?.names).toEqual(['SECURITY']);
			expect(plan.audit?.current).toBe('SECURITY');
			expect(plan.audit?.runAll).toBe(false);
		});
		test('multiple audits are CSV-parsed', () => {
			const plan = planFor(['--project-dir', '.', '--audit', 'SECURITY,DEAD_CODE,LOGIC']);
			expect(plan.audit?.names).toEqual(['SECURITY', 'DEAD_CODE', 'LOGIC']);
		});
		test('--audit-all flips runAll', () => {
			const plan = planFor(['--project-dir', '.', '--audit-all']);
			expect(plan.mode).toBe('audit');
			expect(plan.audit?.runAll).toBe(true);
		});
	});

	describe('7. audit-on-completion + code-after-audit cycle', () => {
		test('plan carries the audit→code→re-audit shape', () => {
			const plan = planFor([
				'--project-dir',
				'.',
				'--audit-on-completion',
				'SECURITY,HYGIENE',
				'--code-after-audit',
			]);
			expect(plan.mode).toBe('audit');
			expect(plan.audit?.onCompletion).toEqual(['SECURITY', 'HYGIENE']);
			expect(plan.audit?.codeAfterAudit).toBe(true);
		});
	});

	describe('8. custom directive', () => {
		test('--prompt populates customDirective and switches phase to directive', () => {
			const plan = planFor(['--project-dir', '.', '--prompt', 'do a thing']);
			expect(plan.prompt.customDirective).toBe('do a thing');
			expect(plan.prompt.phase).toBe('directive');
			expect(fragmentIds(['--project-dir', '.', '--prompt', 'X'])).toContain(
				'custom-directive'
			);
		});
		test('--prompt requires a value', () => {
			expect(() => parseArgs(['--prompt'])).toThrow(ArgsError);
		});
	});

	describe('9. interview mode', () => {
		test('default interview file falls back to .aidd/questions.md', () => {
			const plan = planFor(['--project-dir', '.', '--interview']);
			expect(plan.mode).toBe('interview');
			expect(plan.prompt.variables.interviewFile).toBe('.aidd/questions.md');
		});
		test('explicit interview file is preserved', () => {
			const plan = planFor(['--project-dir', '.', '--interview', 'custom.md']);
			expect(plan.prompt.variables.interviewFile).toBe('custom.md');
		});
	});

	describe('10. in-progress focus', () => {
		test('adds a status=in_progress filter and switches phase', () => {
			const plan = planFor(['--project-dir', '.', '--in-progress']);
			expect(plan.mode).toBe('coding');
			expect(plan.prompt.phase).toBe('in-progress');
			expect(plan.scope.filters).toContainEqual({ field: 'status', value: 'in_progress' });
		});
	});

	describe('11. TODO mode', () => {
		test('--todo selects todo mode', () => {
			const plan = planFor(['--project-dir', '.', '--todo']);
			expect(plan.mode).toBe('todo');
			expect(plan.prompt.phase).toBe('todo');
		});
	});

	describe('12. validate mode', () => {
		test('--validate selects validate mode', () => {
			const plan = planFor(['--project-dir', '.', '--validate']);
			expect(plan.mode).toBe('validate');
			expect(plan.prompt.phase).toBe('validate');
		});
	});

	describe('13. removed role mode', () => {
		test('--role is no longer a recognized flag', () => {
			expect(() => parseArgs(['--role', 'anything'])).toThrow(ArgsError);
		});
	});

	describe('14. director mode', () => {
		test('full required trio resolves a director plan', () => {
			const plan = planFor([
				'--director',
				'--fleet-summary',
				'fleet.json',
				'--director-output',
				'out.json',
				'--suggestion-schema',
				'schema.json',
			]);
			expect(plan.mode).toBe('director');
			expect(plan.scope.kind).toBe('director');
			expect(plan.director?.fleetSummaryPath.endsWith('fleet.json')).toBe(true);
			expect(plan.director?.outputPath.endsWith('out.json')).toBe(true);
			expect(plan.director?.suggestionSchemaPath?.endsWith('schema.json')).toBe(true);
		});
		test('director without fleet-summary throws at plan resolution', () => {
			expect(() =>
				resolveRunPlan(
					parseArgs(['--director', '--director-output', 'out.json']),
					baseConfig
				)
			).toThrow(/--director requires/);
		});
		test('director without director-output throws at plan resolution', () => {
			expect(() =>
				resolveRunPlan(
					parseArgs(['--director', '--fleet-summary', 'fleet.json']),
					baseConfig
				)
			).toThrow(/--director requires/);
		});
	});

	describe('15. check-features / check-artifacts (no-LLM exits)', () => {
		test('--check-features routes through validate mode', () => {
			const plan = planFor(['--project-dir', '.', '--check-features']);
			expect(plan.mode).toBe('validate');
			expect(plan.checks.features).toBe(true);
		});
		test('--check-artifacts routes through validate mode', () => {
			const plan = planFor(['--project-dir', '.', '--check-artifacts']);
			expect(plan.mode).toBe('validate');
			expect(plan.checks.artifacts).toBe(true);
		});
	});

	describe('16. stop signal', () => {
		test('--stop is parsed and points the plan at .aidd/.stop', () => {
			const args = parseArgs(['--project-dir', 'd:/applications/demo', '--stop']);
			expect(args.stopSignal).toBe(true);
			const plan = resolveRunPlan(args, baseConfig);
			expect(plan.stopPolicy.stopFile.endsWith('.aidd/.stop')).toBe(true);
		});
	});

	describe('17. structured-log extraction', () => {
		test('--extract-structured / --extract-batch toggle the output policy', () => {
			expect(
				planFor(['--project-dir', '.', '--extract-structured']).outputPolicy
					.extractStructured
			).toBe(true);
			expect(
				planFor(['--project-dir', '.', '--extract-batch']).outputPolicy.extractBatch
			).toBe(true);
		});
	});

	describe('18. simulation (native dry-run)', () => {
		test('--simulation flips plan.simulation', () => {
			const plan = planFor(['--project-dir', '.', '--cli', 'native', '--simulation']);
			expect(plan.simulation).toBe(true);
			expect(plan.backend).toBe('native');
		});
	});

	describe('19. mode-priority resolution', () => {
		test('director beats audit beats interview beats todo beats validate beats role beats coding', () => {
			expect(
				planFor([
					'--director',
					'--fleet-summary',
					'f',
					'--director-output',
					'o',
					'--audit',
					'SECURITY',
					'--interview',
					'--todo',
					'--validate',
				]).mode
			).toBe('director');
			expect(
				planFor(['--project-dir', '.', '--audit', 'SECURITY', '--interview', '--todo']).mode
			).toBe('audit');
			expect(planFor(['--project-dir', '.', '--interview', '--todo']).mode).toBe('interview');
			expect(planFor(['--project-dir', '.', '--todo', '--validate']).mode).toBe('todo');
			expect(planFor(['--project-dir', '.', '--validate', '--prompt', 'inspect']).mode).toBe(
				'validate'
			);
		});
	});

	describe('20. mode-specific model split', () => {
		const modelConfig: ResolvedConfig = {
			...baseConfig,
			model: 'default-model',
			codeModel: 'code-model',
			auditModel: 'audit-model',
		};
		test('coding picks code-model', () => {
			expect(planFor(['--project-dir', '.'], modelConfig).model).toBe('code-model');
		});
		test('audit picks audit-model', () => {
			expect(planFor(['--project-dir', '.', '--audit', 'SECURITY'], modelConfig).model).toBe(
				'audit-model'
			);
		});
		test('director falls back to base model', () => {
			expect(
				planFor(
					['--director', '--fleet-summary', 'f', '--director-output', 'o'],
					modelConfig
				).model
			).toBe('default-model');
		});
	});

	describe('21. reasoning-effort surface', () => {
		test('valid levels parse', () => {
			for (const level of [
				'none',
				'minimal',
				'low',
				'medium',
				'high',
				'xhigh',
				'max',
			] as const) {
				expect(parseArgs(['--reasoning-effort', level]).reasoningEffort).toBe(level);
			}
			expect(parseArgs(['--reasoning-effort', 'extra high']).reasoningEffort).toBe('xhigh');
		});
		test('invalid level rejected', () => {
			expect(() => parseArgs(['--reasoning-effort', 'maximum'])).toThrow(ArgsError);
		});
	});

	describe('22. stop-when-done toggling', () => {
		test('default is false; --stop-when-done enables single-feature exit', () => {
			expect(parseArgs(['--project-dir', '.']).stopWhenDone).toBe(false);
			expect(parseArgs(['--project-dir', '.', '--stop-when-done']).stopWhenDone).toBe(true);
			expect(parseArgs(['--project-dir', '.', '--no-stop-when-done']).stopWhenDone).toBe(
				false
			);
		});
	});
});
