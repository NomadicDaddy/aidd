import type { AgentEvent } from 'aidd-shared/backends/types';

import { describe, expect, test } from 'bun:test';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { finalCheckStatusFromOutput } from '../../cli/src/orchestrator/details/classification.ts';
import { extractIterationDetails } from '../../cli/src/orchestrator/details.ts';

// deeper's Director run (2026-10-23, run_1792733778239, iteration 038) recorded
// finalChecks.smokeQc as passed for a gate that failed: the agent ran
// `bun run smoke:qc > tmp/qc-full.log 2>&1; echo "exit: $?"; tail -6 tmp/qc-full.log`, whose
// output ends with bun's own failure and then the wrapper's `[exit code: 0]` for the tail (Roger
// mail 938eb550, Morticia mail 479a44ed). These are that run's output shapes.

const FAILED_FULL_GATE = [
	'exit: 1',
	'',
	"3 step(s) failed for mode 'qc':",
	'  [FAIL] Verify the first successful inventory queues integrity once',
	'  [FAIL] Verify scoped capture requests, API keys, saved plan revisions',
	'  [FAIL] Template drift check',
	'error: script "smoke:qc" exited with code 1',
	'',
	'[exit code: 0]',
].join('\n');

const FAILED_FAST_GATE = [
	"  Type 'Element' is not assignable to type 'string'.",
	'[FAIL] Typecheck (exit code 1)',
	'error: script "smoke:qc:fast" exited with code 1',
	'',
	'[exit code: 0]',
].join('\n');

const PASSING_GATE_WITH_NEGATIVE_FIXTURE = [
	'[FAIL] --only nope matched no target in any group, so nothing was compared.',
	'[PASS] test:shared-core 4.1s',
	'[PASS] build:analyze 21.3s',
	'',
	'[exit code: 0]',
].join('\n');

function smokeQcResult(result: string, exitCode?: number): AgentEvent[] {
	return [
		{
			args: { command: 'bun run smoke:qc > tmp/qc.log 2>&1; tail -6 tmp/qc.log' },
			tool: 'bash',
			type: 'tool_call',
		},
		{
			result,
			tool: 'bash',
			type: 'tool_result',
			...(exitCode === undefined ? {} : { exitCode }),
		},
	];
}

describe('a final check reads the gate, not the wrapper', () => {
	test('the failed full gate and the failed fast gate read as failed', () => {
		expect(finalCheckStatusFromOutput(FAILED_FULL_GATE)).toBe('failed');
		expect(finalCheckStatusFromOutput(FAILED_FAST_GATE)).toBe('failed');
	});

	test('a passing gate stays passed despite an earlier negative-fixture [FAIL] line', () => {
		expect(finalCheckStatusFromOutput(PASSING_GATE_WITH_NEGATIVE_FIXTURE)).toBe('passed');
	});

	// Morticia #19774: `smoke:qc > log 2>&1; echo "exit: $?"` with no tail prints only the echo
	// and then the wrapper's zero.
	test('an echoed `exit: N` after a redirected gate is the gate verdict', () => {
		expect(finalCheckStatusFromOutput('exit: 1\n\n[exit code: 0]')).toBe('failed');
		expect(finalCheckStatusFromOutput('exit: 0\n\n[exit code: 0]')).toBe('passed');
	});

	test('[FAIL] and [PASS] markers followed by a name are recognised', () => {
		expect(finalCheckStatusFromOutput('[FAIL] check:function-size')).toBe('failed');
		expect(finalCheckStatusFromOutput('[PASS] build:analyze 18.6s')).toBe('passed');
	});

	test('a non-zero wrapper exit is a failure, and a bare zero one is a pass', () => {
		expect(finalCheckStatusFromOutput('[PASS] lint\n[exit code: 2]')).toBe('failed');
		expect(finalCheckStatusFromOutput('$ tsc --noEmit\nExit code: 0')).toBe('passed');
		expect(finalCheckStatusFromOutput('no verdict here')).toBeUndefined();
	});

	test('iteration details record the failed gate whether or not the backend sends an exit code', () => {
		for (const exitCode of [undefined, 0]) {
			const details = extractIterationDetails(
				smokeQcResult(FAILED_FULL_GATE, exitCode),
				orchestratorExitCodes.success,
			);
			expect(details.summary.finalChecks).toEqual({ smokeQc: 'failed' });
		}
	});

	test('a structured zero exit with no verdict in the output is still a pass', () => {
		const details = extractIterationDetails(
			smokeQcResult('[OK] lint\n[OK] typecheck', 0),
			orchestratorExitCodes.success,
		);
		expect(details.summary.finalChecks).toEqual({ smokeQc: 'passed' });
	});
});
