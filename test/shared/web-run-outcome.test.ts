import { describe, expect, test } from 'bun:test';
import { classifyWebRun, classifyWebRunTelemetryBucket } from '../../shared/src/runs/outcome.ts';

describe('classifyWebRun', () => {
	test('classifies a clean completion as emerald success', () => {
		const outcome = classifyWebRun({
			status: 'completed',
			stopReason: 'completed',
			exitCode: 0,
		});
		expect(outcome.tone).toBe('emerald');
		expect(outcome.label).toBe('Completed');
	});

	test('classifies a blocked completion-marker run as amber warnings', () => {
		const outcome = classifyWebRun({
			status: 'failed',
			stopReason: 'blocked',
			exitCode: 7,
			summary: 'completion_marker_missing_or_unaccepted: completed feature demo',
		});
		expect(outcome.label).toBe('Completed (warnings)');
		expect(outcome.tone).toBe('amber');
	});

	test('classifies a hard gate block as red', () => {
		const outcome = classifyWebRun({ status: 'failed', stopReason: 'blocked', exitCode: 1 });
		expect(outcome.label).toBe('Blocked: gate');
		expect(outcome.tone).toBe('red');
	});

	test('decodes a named orchestrator exit code on exit_error', () => {
		const outcome = classifyWebRun({ status: 'failed', stopReason: 'exit_error', exitCode: 7 });
		expect(outcome.label).toBe('Validation failed');
		expect(outcome.tone).toBe('red');
	});

	test('downgrades a completed run whose summary carries the uncommitted-source marker to amber', () => {
		// Regression for run-end-dirty-tree-check: a run that dirties tracked source after its
		// last feature commit (post-commit formatter/codegen) must not read as a clean emerald
		// "Completed". The orchestrator appends the marker to the run summary at run end.
		const outcome = classifyWebRun({
			status: 'completed',
			stopReason: 'completed',
			exitCode: 0,
			summary:
				'coding completed feature-x; no incomplete feature work; uncommitted_source_files: 13 source file(s) left uncommitted at run end',
		});
		expect(outcome.label).toBe('Completed · dirty tree');
		expect(outcome.tone).toBe('amber');
		expect(
			classifyWebRunTelemetryBucket({
				exitCode: 0,
				status: 'completed',
				stopReason: 'completed',
				summary: 'uncommitted_source_files: 13 source file(s) left uncommitted at run end',
			})
		).toBe('warnings');
	});

	test('marker-free completed summaries stay emerald via the status fallback branch too', () => {
		const clean = classifyWebRun({
			status: 'completed',
			stopReason: 'unrecognized_reason',
			exitCode: 0,
			summary: 'done',
		});
		expect(clean.tone).toBe('emerald');
		const dirty = classifyWebRun({
			status: 'completed',
			stopReason: 'unrecognized_reason',
			exitCode: 0,
			summary: 'done; uncommitted_source_files: 2 source file(s) left uncommitted at run end',
		});
		expect(dirty.tone).toBe('amber');
		expect(dirty.label).toBe('Completed · dirty tree');
	});

	test('classifies a parked worktree merge as an amber "Awaiting merge" (warnings, not failure)', () => {
		const outcome = classifyWebRun({
			status: 'waiting_approval',
			stopReason: 'merge_conflict_parked',
			exitCode: 77,
		});
		expect(outcome.label).toBe('Awaiting merge');
		expect(outcome.tone).toBe('amber');
		expect(
			classifyWebRunTelemetryBucket({
				exitCode: 77,
				status: 'waiting_approval',
				stopReason: 'merge_conflict_parked',
			})
		).toBe('warnings');
	});
});

describe('classifyWebRunTelemetryBucket', () => {
	test('keeps every telemetry outcome distinct', () => {
		expect(classifyWebRunTelemetryBucket({ status: 'completed', exitCode: 0 })).toBe(
			'completed'
		);
		expect(classifyWebRunTelemetryBucket({ status: 'failed', exitCode: 1 })).toBe('failed');
		expect(classifyWebRunTelemetryBucket({ status: 'killed', stopReason: 'killed' })).toBe(
			'killed'
		);
		expect(classifyWebRunTelemetryBucket({ status: 'stopped', stopReason: 'no_work' })).toBe(
			'noWork'
		);
		expect(classifyWebRunTelemetryBucket({ status: 'running' })).toBe('running');
		expect(
			classifyWebRunTelemetryBucket({ status: 'stopped', stopReason: 'stop_requested' })
		).toBe('stopped');
		expect(
			classifyWebRunTelemetryBucket({ status: 'stopped', stopReason: 'max_iterations' })
		).toBe('warnings');
	});
});
