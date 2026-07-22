import { afterEach, describe, expect, test } from 'bun:test';

import {
	beginLaunch,
	endLaunch,
	resolveLaunchedRunTerminal,
	setLaunchedRunEmitter,
	trackLaunchedRun,
	type LaunchedRunInfo,
	type LaunchedRunTerminal,
} from '../../frontend/src/lib/launchedRuns.ts';

const terminal: LaunchedRunTerminal = {
	exitCode: 0,
	status: 'completed',
	stopReason: 'no_work',
	summary: "Roadmap gate blocked coding: doc-currency is outside active milestone 'v1.0'",
};

afterEach(() => {
	setLaunchedRunEmitter(undefined);
});

describe('launchedRuns', () => {
	test('a tracked run is resolved (and consumed) by its terminal event', () => {
		trackLaunchedRun('run_a', { feature: 'doc-currency' });
		const info = resolveLaunchedRunTerminal('run_a', terminal);
		expect(info?.feature).toBe('doc-currency');
		// A duplicate terminal (e.g. sweep + terminalize) must not resolve a second time.
		expect(resolveLaunchedRunTerminal('run_a', terminal)).toBeUndefined();
	});

	test('a run never launched from the UI is ignored', () => {
		expect(resolveLaunchedRunTerminal('background_run', terminal)).toBeUndefined();
	});

	test('an instant run that finishes before its launch is tracked still toasts', () => {
		// Reproduces the race: the terminal broadcast arrives while the launch POST is still in
		// flight (beginLaunch fired, trackLaunchedRun not yet). The terminal must be buffered and
		// then reconciled — firing the emitter — once trackLaunchedRun lands.
		const emitted: { info: LaunchedRunInfo; terminal: LaunchedRunTerminal }[] = [];
		setLaunchedRunEmitter((info, t) => emitted.push({ info, terminal: t }));

		beginLaunch();
		const earlyResolve = resolveLaunchedRunTerminal('run_fast', terminal);
		expect(earlyResolve).toBeUndefined(); // not toasted yet — buffered
		expect(emitted).toHaveLength(0);

		trackLaunchedRun('run_fast', { feature: 'doc-currency' });
		endLaunch();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.info.feature).toBe('doc-currency');
		expect(emitted[0]?.terminal.summary).toContain('outside active milestone');
	});

	test('a terminal for an untracked run is not buffered when no launch is in flight', () => {
		// Without an in-flight launch, a background run completing must not be retained — a later
		// (unrelated) track of the same id must not spuriously toast.
		const emitted: LaunchedRunInfo[] = [];
		setLaunchedRunEmitter((info) => emitted.push(info));

		resolveLaunchedRunTerminal('run_bg', terminal); // no beginLaunch → not buffered
		trackLaunchedRun('run_bg', { feature: 'later' });

		expect(emitted).toHaveLength(0);
		// And it is now tracked normally, resolved only by a fresh terminal event.
		expect(resolveLaunchedRunTerminal('run_bg', terminal)?.feature).toBe('later');
	});

	test('a buffered orphan past its TTL is not reconciled', () => {
		beginLaunch();
		resolveLaunchedRunTerminal('run_stale', terminal, 1_000);
		endLaunch();

		const emitted: LaunchedRunInfo[] = [];
		setLaunchedRunEmitter((info) => emitted.push(info));
		// Track far enough in the future that the orphan has expired (TTL is 15s).
		trackLaunchedRun('run_stale', { feature: 'doc-currency' }, 1_000 + 60_000);

		expect(emitted).toHaveLength(0);
	});
});
