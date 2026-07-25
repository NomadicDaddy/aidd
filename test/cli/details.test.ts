import { describe, expect, test } from 'bun:test';
import { extractIterationDetails } from '../../cli/src/orchestrator/details.ts';
import { buildFeatureBlockingContext } from '../../cli/src/orchestrator/run/blocking-context.ts';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';

describe('extractIterationDetails', () => {
	test('separates read, edit, and create file tool calls', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'read_file', args: { path: 'src/a.ts' } },
			{ type: 'tool_call', tool: 'edit_file', args: { path: 'src/a.ts' } },
			{ type: 'tool_call', tool: 'write_file', args: { path: 'src/b.ts' } },
			{ type: 'tool_call', tool: 'Read', args: { file_path: 'src/c.ts' } },
			{ type: 'tool_call', tool: 'Edit', args: { file_path: 'src/c.ts' } },
		];
		const details = extractIterationDetails(events, orchestratorExitCodes.success);
		expect(details.filesRead).toEqual(['src/a.ts', 'src/c.ts']);
		expect(details.filesEdited).toEqual(['src/a.ts', 'src/c.ts']);
		expect(details.filesCreated).toEqual(['src/b.ts']);
	});

	test('captures bash commands from various tool aliases', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun test' } },
			{ type: 'tool_call', tool: 'Bash', args: { command: 'ls' } },
		];
		const details = extractIterationDetails(events, orchestratorExitCodes.success);
		expect(details.commands).toEqual(['bun test', 'ls']);
		expect(details.summary.bashCommandsRun).toBe(2);
	});

	test('classifies error types from tool_result text', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run typecheck' } },
			{
				type: 'tool_result',
				tool: 'bash',
				result: 'error TS2322: Type string is not assignable',
			},
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run lint' } },
			{ type: 'tool_result', tool: 'bash', result: 'eslint found 3 problems' },
		];
		const details = extractIterationDetails(events, orchestratorExitCodes.success);
		expect(details.summary.hasTypeErrors).toBe(true);
		expect(details.summary.hasLintErrors).toBe(true);
		expect(details.summary.hasBuildErrors).toBe(false);
		expect(details.errors.map((entry) => entry.type)).toEqual(['typescript', 'lint']);
	});

	test('does not classify non-command tool output as errors', () => {
		const events: AgentEvent[] = [
			{
				type: 'tool_call',
				tool: 'Read',
				args: { file_path: 'scripts/build.ts' },
			},
			{
				type: 'tool_result',
				tool: 'Read',
				result: '// raise timeout; run eslint then tsc --noEmit before bun build',
			},
			{
				type: 'tool_call',
				tool: 'bash',
				args: { command: 'git diff' },
			},
			{
				type: 'tool_result',
				tool: 'bash',
				result: '-const x: string = 1; // error TS2322 once removed\nExit code: 0',
			},
			{
				type: 'tool_call',
				tool: 'Grep',
				args: { pattern: 'timeout' },
			},
			{
				type: 'tool_result',
				tool: 'Grep',
				result: 'src/a.ts:1: build failed retry timeout',
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.errors).toEqual([]);
		expect(details.summary.hasTypeErrors).toBe(false);
		expect(details.summary.hasLintErrors).toBe(false);
		expect(details.summary.hasBuildErrors).toBe(false);
	});

	test('keeps encountered errors separate from final successful checks', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run typecheck' } },
			{
				type: 'tool_result',
				tool: 'bash',
				result: 'src/a.ts(1,1): error TS2322: Type mismatch\nExit code: 2',
			},
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run typecheck' } },
			{
				type: 'tool_result',
				tool: 'bash',
				result: '$ tsc --noEmit\nExit code: 0',
			},
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
			{
				type: 'tool_result',
				tool: 'bash',
				result: '$ bun run typecheck && bun run build\nExit code: 0',
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.summary.hasTypeErrors).toBe(true);
		expect(details.summary.finalChecks).toEqual({
			smokeQc: 'passed',
			typecheck: 'passed',
		});
		expect(details.errors.map((entry) => entry.type)).toEqual(['typescript']);
		expect(details.failedCommands).toEqual(['bun run typecheck']);
	});

	test('uses Codex command exit codes instead of classifying successful command contents', () => {
		const events: AgentEvent[] = [
			{
				type: 'tool_call',
				tool: 'bash',
				args: { command: 'pwsh -Command "Get-Content AGENTS.md"' },
			},
			{
				type: 'tool_result',
				tool: 'bash',
				exitCode: 0,
				result: 'TypeScript: zero warnings; run lint and bun build before completion',
			},
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
			{
				type: 'tool_result',
				tool: 'bash',
				exitCode: 0,
				result: '[OK] lint\n[OK] typecheck\n[OK] build',
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.errors).toEqual([]);
		expect(details.failedCommands).toEqual([]);
		expect(details.summary.finalChecks).toEqual({ smokeQc: 'passed' });
		expect(
			buildFeatureBlockingContext(details, 'completion_marker_missing_or_unaccepted', 'now')
				.commands,
		).toEqual([]);
	});

	test('records a silent nonzero Codex gate as failed', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
			{ type: 'tool_result', tool: 'bash', exitCode: 1, result: '' },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.failedCommands).toEqual(['bun run smoke:qc']);
		expect(details.summary.finalChecks).toEqual({ smokeQc: 'failed' });
		expect(
			buildFeatureBlockingContext(details, 'completion_marker_missing_or_unaccepted', 'now')
				.commands,
		).toEqual(['bun run smoke:qc']);
	});

	test('falls back to gates that ran when the backend reports no command verdicts', () => {
		// The opencode/kilocode shape: bash tool_results with no exit code and no [PASS]/[FAIL]
		// marker. Nothing can be proven to have failed, but parking the feature with zero evidence
		// is worse than naming the gate that was in flight.
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
			{ type: 'tool_result', tool: 'bash', result: 'running checks...' },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.commandStatusEvidence).toBe(false);
		expect(details.failedCommands).toEqual([]);
		expect(
			buildFeatureBlockingContext(details, 'completion_marker_missing_or_unaccepted', 'now')
				.commands,
		).toEqual(['bun run smoke:qc']);
	});

	test('does not fall back when a reporting backend recorded every gate as passing', () => {
		// Contrast with the case above: exit codes were available, so an empty failedCommands is a
		// trustworthy "nothing failed" and must not be padded with gates that demonstrably passed.
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:qc' } },
			{ type: 'tool_result', tool: 'bash', exitCode: 0, result: '[OK] lint' },
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run test' } },
			{ type: 'tool_result', tool: 'bash', exitCode: 0, result: 'all pass' },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.success);

		expect(details.commandStatusEvidence).toBe(true);
		expect(
			buildFeatureBlockingContext(details, 'completion_marker_missing_or_unaccepted', 'now')
				.commands,
		).toEqual([]);
	});

	test('maps exit codes to outcome status', () => {
		expect(extractIterationDetails([], orchestratorExitCodes.success).outcome.status).toBe(
			'success',
		);
		expect(extractIterationDetails([], orchestratorExitCodes.idleTimeout).outcome.status).toBe(
			'idle_timeout',
		);
		expect(extractIterationDetails([], orchestratorExitCodes.rateLimited).outcome.status).toBe(
			'rate_limited',
		);
		expect(
			extractIterationDetails([], orchestratorExitCodes.providerError).outcome.status,
		).toBe('provider_error');
		expect(extractIterationDetails([], 99).outcome.status).toBe('failure');
	});

	test('classifies idle verification lifecycle conflicts from command evidence', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:dev' } },
			{
				type: 'tool_call',
				tool: 'bash',
				args: { command: 'bun scripts/crawltest.ts --page /' },
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.idleTimeout);

		expect(details.outcome.status).toBe('verification_lifecycle_conflict');
		expect(details.outcome.exitCode).toBe(orchestratorExitCodes.idleTimeout);
		expect(details.outcome.verificationLifecycleConflict).toEqual({
			commands: ['bun run smoke:dev', 'bun scripts/crawltest.ts --page /'],
			controlledLifecycle: true,
			failurePhase: 'verification',
			reason: 'server_lifecycle_conflict',
		});
	});

	test('classifies active verification timeouts from sparse assistant progress', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: 'Running long verification: `bun run smoke:dev` followed by focused browser verification.',
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.idleTimeout);

		expect(details.outcome.status).toBe('active_verification_timeout');
		expect(details.outcome.exitCode).toBe(orchestratorExitCodes.idleTimeout);
		expect(details.outcome.activeVerificationTimeout).toEqual({
			broadCommands: ['bun run smoke:dev'],
			commands: ['bun run smoke:dev'],
			failurePhase: 'verification',
			lastProgress:
				'Running long verification: `bun run smoke:dev` followed by focused browser verification.',
			reason: 'silent_during_active_verification',
			targetedEvidence: [],
		});
	});

	test('detects recovery eligibility when targeted checks passed before a broad smoke timeout', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: 'Targeted route checks passed with zero console errors.',
			},
			{
				type: 'assistant_text',
				chunk: 'Starting broad lifecycle verification: `bun run smoke:dev`.',
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.idleTimeout);

		expect(details.outcome.status).toBe('active_verification_recovery');
		expect(details.outcome.activeVerificationRecovery).toEqual({
			commands: ['bun run smoke:dev'],
			decision: 'waiting_approval',
			failurePhase: 'verification',
			reason: 'targeted_verification_passed_broad_gate_timed_out',
			targetedEvidence: ['Targeted route checks passed with zero console errors.'],
			timedOutCommand: 'bun run smoke:dev',
		});
	});

	test('classifies active verification timeouts from command start evidence', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'bash', args: { command: 'bun run smoke:dev' } },
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.idleTimeout);

		expect(details.outcome.status).toBe('active_verification_timeout');
		expect(details.outcome.activeVerificationTimeout).toMatchObject({
			broadCommands: ['bun run smoke:dev'],
			commands: ['bun run smoke:dev'],
			failurePhase: 'verification',
			reason: 'silent_during_active_verification',
			targetedEvidence: [],
		});
	});

	test('does not classify idle verification discussion as active execution', () => {
		const events: AgentEvent[] = [
			{
				type: 'assistant_text',
				chunk: 'Lint failed and the browser verification still needs investigation.',
			},
			{ type: 'idle_warning', afterMs: 60_000 },
			{ type: 'error', reason: 'idle', meta: { killMs: 90_000 } },
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.idleTimeout);

		expect(details.outcome.status).toBe('idle_timeout');
		expect(details.outcome.activeVerificationTimeout).toBeUndefined();
	});

	test('attaches feature slug and description when work is feature kind', () => {
		const work: SelectedWork = {
			id: 'feature-ratelimit-backoff',
			description: 'wire rate-limit retry',
			kind: 'feature',
		};
		const details = extractIterationDetails([], orchestratorExitCodes.success, work);
		expect(details.featureSlug).toBe('feature-ratelimit-backoff');
		expect(details.featureDescription).toBe('wire rate-limit retry');
	});

	test('does not attach feature info for non-feature work', () => {
		const work: SelectedWork = { id: 'todo-1', description: 'todo', kind: 'todo' };
		const details = extractIterationDetails([], orchestratorExitCodes.success, work);
		expect(details.featureSlug).toBeUndefined();
	});

	test('summary counts unique files only', () => {
		const events: AgentEvent[] = [
			{ type: 'tool_call', tool: 'read_file', args: { path: 'a.ts' } },
			{ type: 'tool_call', tool: 'read_file', args: { path: 'a.ts' } },
			{ type: 'tool_call', tool: 'read_file', args: { path: 'b.ts' } },
		];
		const details = extractIterationDetails(events, orchestratorExitCodes.success);
		expect(details.summary.totalToolCalls).toBe(3);
		expect(details.summary.uniqueFilesRead).toBe(2);
	});

	test('extracts provider refusal message and request id', () => {
		const events: AgentEvent[] = [
			{
				type: 'error',
				reason: 'provider',
				meta: {
					result: 'API Error: Claude Code is unable to respond to this request. Request ID: req_123abc',
				},
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.errors[0]?.type).toBe('provider');
		expect(details.providerError).toEqual({
			message:
				'API Error: Claude Code is unable to respond to this request. Request ID: req_123abc',
			requestId: 'req_123abc',
		});
	});

	test('excludes explicitly nonfatal diagnostics from provider errors and error totals', () => {
		const details = extractIterationDetails(
			[
				{
					fatal: false,
					meta: { message: 'Skill descriptions were shortened.' },
					reason: 'provider',
					type: 'error',
				},
			],
			orchestratorExitCodes.success,
		);

		expect(details.errors).toEqual([]);
		expect(details.providerError).toBeUndefined();
	});

	test('unwraps JSON-encoded provider error messages to the human-readable text', () => {
		// codex emits {type:'error', message:'{"type":"error","status":400,"error":{...}}'}
		const events: AgentEvent[] = [
			{
				type: 'error',
				reason: 'provider',
				meta: {
					type: 'error',
					message:
						'{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.6-sol\' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}}',
				},
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe(
			"The 'gpt-5.6-sol' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.",
		);
	});

	test('keeps the informative provider error over the trailing exit-code fallback', () => {
		const events: AgentEvent[] = [
			{
				type: 'error',
				reason: 'provider',
				meta: {
					type: 'error',
					message:
						'{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The model requires a newer version of Codex."}}',
				},
			},
			{
				type: 'error',
				reason: 'provider',
				meta: { exitCode: 1, stderr: 'Reading prompt from stdin...\n' },
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe('The model requires a newer version of Codex.');
		expect(details.errors).toHaveLength(2);
	});

	test('uses the exit-code fallback when no informative provider error exists', () => {
		const events: AgentEvent[] = [
			{
				type: 'error',
				reason: 'provider',
				meta: { exitCode: 1, stderr: 'command not found: codex\n' },
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe('command not found: codex');
	});

	test('upgrades from the exit-code fallback if an informative error arrives later', () => {
		const events: AgentEvent[] = [
			{
				type: 'error',
				reason: 'provider',
				meta: { exitCode: 1, stderr: 'starting...\n' },
			},
			{
				type: 'error',
				reason: 'provider',
				meta: { message: 'API key expired' },
			},
		];

		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe('API key expired');
	});
});

// run_1784565813011_7f576ced: a skill run stopped at "Please choose: 1. … 2. … 3." with its
// deliverable untouched and recorded stopReason `completed`, exit 0. Only the native loop has an
// AskUserQuestion tool; a CLI backend asks in prose, so the tool-only check never matched and a run
// blocked on a human decision was indistinguishable from a successful one.
describe('blocked_needs_user_input from prose', () => {
	function detailsFor(chunk: string, trailing: AgentEvent[] = []) {
		return extractIterationDetails(
			[{ chunk, type: 'assistant_text' }, ...trailing],
			orchestratorExitCodes.success,
		);
	}

	test('classifies a closing request for a decision as blocked', () => {
		const details = detailsFor(
			'Blocked at Phase 1: the app lacks the skill-required routes.tsx.\n\nPlease choose:\n\n1. Approve using App.tsx.\n2. Provide a name.\n3. End as a no-op.',
		);
		expect(details.outcome.status).toBe('blocked_needs_user_input');
	});

	// run_1784567400208_fac9c594: a gated skill ends by naming the phrase that unblocks it. Neither
	// "requires approval before writing" nor "Reply `apply everything` to approve" matched the
	// original patterns, and the run reported `completed` with nothing written.
	test('classifies an approval-gated stop as blocked', () => {
		const details = detailsFor(
			'Summary: 5 new routes, 2 removals.\n\nNo files have been changed, documented, or committed because Phase 5 requires approval before writing. Reply `apply everything` to approve all proposed edits, or specify which removed route rows to retain.',
		);
		expect(details.outcome.status).toBe('blocked_needs_user_input');
	});

	test('does not flag a park, which has its own outcome', () => {
		const details = detailsFor(
			'Parked the selected feature as waiting_approval, passes: false. Manual steps recorded in the changelog.',
		);
		expect(details.outcome.status).not.toBe('blocked_needs_user_input');
	});

	test('does not flag a courteous sign-off after finished work', () => {
		// "let me know if you want…" is how an agent signs off having done the job; treating it as a
		// question parks completed work as blocked.
		const details = detailsFor(
			'Implemented the feature and smoke:qc passed. Let me know if you want the other approach instead.',
		);
		expect(details.outcome.status).not.toBe('blocked_needs_user_input');
	});

	test('does not flag a question the agent then resolved with more work', () => {
		const details = detailsFor('Please choose which approach to take.', [
			{ args: { command: 'bun test' }, tool: 'bash', type: 'tool_call' },
			{ chunk: 'Picked the simpler one; tests pass.', type: 'assistant_text' },
		]);
		expect(details.outcome.status).not.toBe('blocked_needs_user_input');
	});
});

describe('codex stream end-to-end provider error', () => {
	test('failed run never blames a nonfatal advisory, even with nothing better to report', async () => {
		const { parseCodexBackendOutput } = await import('aidd-shared/backends/parsers/codex');
		const stdout = JSON.stringify({
			type: 'item.completed',
			item: {
				id: 'item_0',
				type: 'error',
				message:
					'Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata.',
			},
		});
		const events = parseCodexBackendOutput(stdout, 'Reading prompt from stdin...\n', 1);
		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		// The advisory is benign by construction, so it cannot be the cause of the failure.
		// Falling back to the (uninformative) stderr is honest; naming the advisory is not.
		expect(details.providerError?.message).not.toContain('Model metadata');
		expect(details.errors.some((error) => error.message.includes('Model metadata'))).toBe(
			false,
		);
	});

	test('advisory emitted on a run that failed without any provider error yields none', async () => {
		const { parseCodexBackendOutput } = await import('aidd-shared/backends/parsers/codex');
		// The run_1784553894666_38781597 shape: codex exits 0 having emitted only the
		// skills-budget advisory, and the orchestrator independently records exit 73 for a
		// missing AIDD_RESULT. The summary must not read "provider error: Skill descriptions…".
		const stdout = JSON.stringify({
			type: 'item.completed',
			item: {
				id: 'item_0',
				type: 'error',
				message:
					'Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter.',
			},
		});
		const events = parseCodexBackendOutput(stdout, '', 0);
		const details = extractIterationDetails(events, orchestratorExitCodes.missingResult);

		expect(details.providerError).toBeUndefined();
		expect(details.errors).toEqual([]);
	});

	test('turn.failed displaces an earlier unspecified item error', async () => {
		const { parseCodexBackendOutput } = await import('aidd-shared/backends/parsers/codex');
		const stdout = [
			JSON.stringify({
				type: 'item.completed',
				item: {
					id: 'item_0',
					type: 'error',
					message: 'stream disconnected before completion',
				},
			}),
			JSON.stringify({
				type: 'turn.failed',
				error: { message: 'requires a newer version of Codex' },
			}),
		].join('\n');
		const events = parseCodexBackendOutput(stdout, '', 1);
		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe('requires a newer version of Codex');
	});

	test('unspecified item error displaces an earlier advisory', async () => {
		const { parseCodexBackendOutput } = await import('aidd-shared/backends/parsers/codex');
		const stdout = [
			JSON.stringify({
				type: 'item.completed',
				item: {
					id: 'item_0',
					type: 'error',
					message:
						'Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata.',
				},
			}),
			JSON.stringify({
				type: 'item.completed',
				item: {
					id: 'item_1',
					type: 'error',
					message: 'stream disconnected before completion',
				},
			}),
		].join('\n');
		const events = parseCodexBackendOutput(stdout, '', 1);
		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toBe('stream disconnected before completion');
	});

	test('parsed codex failure stream surfaces the real error, not the stdin banner', async () => {
		const { parseCodexBackendOutput } = await import('aidd-shared/backends/parsers/codex');
		// Verbatim shape of the failed run_1783654725474_9c7aa476 stream.
		const stdout = [
			JSON.stringify({ type: 'thread.started', thread_id: '019f4a1b' }),
			JSON.stringify({
				type: 'item.completed',
				item: {
					id: 'item_0',
					type: 'error',
					message:
						'Model metadata for `gpt-5.6-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.',
				},
			}),
			JSON.stringify({ type: 'turn.started' }),
			JSON.stringify({
				type: 'error',
				message:
					'{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.6-sol\' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}}',
			}),
			JSON.stringify({
				type: 'turn.failed',
				error: {
					message:
						'{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.6-sol\' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}}',
				},
			}),
		].join('\n');
		const events = parseCodexBackendOutput(stdout, 'Reading prompt from stdin...\n', 1);
		const details = extractIterationDetails(events, orchestratorExitCodes.providerError);

		expect(details.providerError?.message).toContain('requires a newer version of Codex');
		expect(details.providerError?.message).not.toContain('Reading prompt from stdin');
	});
});
