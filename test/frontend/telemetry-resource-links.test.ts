import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderTelemetryLinks(): string {
	const script = String.raw`
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { InvocationsTable } from './src/pages/telemetry/InvocationsTable.tsx';
import { LeaderboardCard } from './src/pages/telemetry/LeaderboardCard.tsx';

function usage(resourceType, resourceId, resourceName = resourceId, total = 1) {
	return {
		avgDurationMs: 1000,
		completed: total,
		failed: 0,
		flagged: 0,
		killed: 0,
		lastUsedAt: 1700000000000,
		nested: 0,
		noWork: 0,
		resourceId,
		resourceName,
		resourceType,
		running: 0,
		stopped: 0,
		topLevel: total,
		total,
		warnings: 0,
	};
}

function invocation(resourceType, resourceId, overrides = {}) {
	return {
		argsPresent: false,
		backend: null,
		completedAt: 1700000001000,
		durationMs: 1000,
		errorMessage: null,
		exitCode: 0,
		id: resourceId,
		model: null,
		parentInvocationId: null,
		parentResourceId: null,
		parentResourceName: null,
		parentResourceType: null,
		projectName: 'aidd',
		projectPath: 'D:/applications/aidd',
		resourceId,
		resourceName: resourceId,
		resourceType,
		runExitCode: null,
		runId: null,
		runStatus: null,
		runStopReason: null,
		runSummary: null,
		sessionId: null,
		source: 'web',
		startedAt: 1700000000000,
		status: 'completed',
		...overrides,
	};
}

const availableResources = {
	recipeIds: new Set(['current recipe /?']),
	skillIds: new Set(['current skill /?']),
};
const resources = [
	usage('run', 'run /?'),
	usage('skill', 'current skill /?'),
	usage('skill', 'retired skill /?', 'Retired skill'),
	usage('recipe', 'current recipe /?'),
	usage('recipe', 'retired recipe /?', 'Retired recipe', 7),
];
const invocations = [
	invocation('run', 'run /?'),
	invocation('skill', 'current skill /?'),
	invocation('skill', 'retired skill /?'),
	invocation('recipe', 'current recipe /?'),
	invocation('recipe', 'retired recipe /?'),
	invocation('run', 'child run', {
		parentResourceId: 'retired recipe /?',
		parentResourceName: 'Retired recipe parent',
		parentResourceType: 'recipe',
	}),
];
const content = createElement(Fragment, null,
	createElement(LeaderboardCard, { availableResources, rows: resources }),
	createElement(InvocationsTable, { availableResources, invocations }),
);
console.log(renderToStaticMarkup(createElement(MemoryRouter, null, content)));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('telemetry resource links', () => {
	test('link current resources without linking retired historical rows', () => {
		const markup = renderTelemetryLinks();

		expect(markup.match(/href="\/runs\?run=run%20%2F%3F"/g)).toHaveLength(3);
		expect(markup.match(/href="\/skills\?q=current%20skill%20%2F%3F"/g)).toHaveLength(3);
		expect(markup.match(/href="\/recipes\/current%20recipe%20%2F%3F"/g)).toHaveLength(3);
		expect(markup).not.toContain('href="/skills?q=retired%20skill%20%2F%3F"');
		expect(markup).not.toContain('href="/recipes/retired%20recipe%20%2F%3F"');
		expect(markup).toContain('Retired skill');
		expect(markup).toContain('Retired recipe');
		expect(markup).toContain('Retired recipe parent');
		expect(markup).toContain('>7</div>');
		expect(markup).toContain('7 completed');
		expect(markup).not.toContain('href="/runs"');
		expect(markup).not.toContain('href="/skills"');
	});
});
