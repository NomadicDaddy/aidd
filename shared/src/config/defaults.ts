import type { ResolvedConfig, ResolvedWebConfig } from './types.ts';

import { defaultIgnoredFolders } from './schema.ts';

export const defaults: ResolvedConfig = {
	auditsEnabled: true,
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	// Two consecutive silent provider-timeout retries, then give up — a non-streaming or stalled
	// provider must not spin up fresh agents indefinitely when maxIterations is unlimited. Set to 0
	// to disable the cap (falls back to the iteration limit).
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: null,
	noClean: false,
	noWorkBackoffMs: 30_000,
	preflightDoctor: true,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 10800,
	web: {
		allowedOrigins: [],
		allowedRoots: [],
		allowRemote: false,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: '',
		hostname: '127.0.0.1',
		ignoredFolders: [...defaultIgnoredFolders],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	},
};

export const defaultWebConfig: ResolvedWebConfig = {
	allowedOrigins: [],
	allowedRoots: [],
	allowRemote: false,
	autoChainLimit: 3,
	autoChainRuns: false,
	dataDir: '',
	hostname: '127.0.0.1',
	ignoredFolders: [...defaultIgnoredFolders],
	maxConcurrentRuns: 2,
	maxConcurrentRunsPerProject: 2,
	port: 3210,
	showSpernakitProject: false,
	spernakitFleetManifest: null,
	spernakitInitScript: null,
	spernakitTemplateRef: null,
	spernakitTemplateRepo: 'NomadicDaddy/spernakit',
	templates: [],
	traceDataMovement: false,
	useWorktrees: false,
};

// 45s was too tight for the directorCycle surface, which sends the full
// fleet summary (tens of thousands of tokens) at high reasoning effort; a
// single timeout there aborts the whole cycle. 120s gives the heaviest surface
// room to finish while still bounding hung requests. Override per-install via
// directAi.timeoutSeconds.
export const defaultDirectAiTimeoutSeconds = 120;

// Default cadence for the automatic director cycle: twice a day. Also used as
// the startup staleness threshold (a fleet not analyzed in this window triggers a
// catch-up cycle once the web process has warmed up). Override per-install via
// director.schedule.intervalHours.
export const defaultDirectorIntervalHours = 12;

// Director suggestion shaping. 'targeted' makes each cycle surface concrete,
// individually-runnable next actions (one per artifact, top N per bucket) plus a
// rollup for the remainder, instead of one sweeping "resolve the whole backlog"
// suggestion. Override per-install via director.suggestions.*.
export const defaultDirectorSuggestionGranularity = 'targeted' as const;
export const defaultDirectorMaxPerBucket = 3;
