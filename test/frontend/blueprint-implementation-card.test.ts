import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

type RenderedCase =
	| 'blocked'
	| 'building'
	| 'complete'
	| 'preparing'
	| 'queued'
	| 'ready'
	| 'setupIncomplete'
	| 'stopped';

function renderBlueprintCards(): Record<RenderedCase, string> {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { BlueprintImplementationCard } from './src/pages/projects/detail/BlueprintImplementationCard.tsx';

function render(implementation) {
	const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
	const project = {
		id: 'fixture',
		implementation: { activity: null, firstFeature: null, reason: null, ...implementation },
		name: 'summon',
		path: 'D:/apps/summon',
	};
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(
				MemoryRouter,
				null,
				createElement(BlueprintImplementationCard, { project }),
			),
		),
	);
}

const missing = 'Project setup is incomplete: .aidd/spec.md and .aidd/CHANGELOG.md are missing.';

console.log(JSON.stringify({
	blocked: render({
		blueprintReady: false,
		reason: 'The coding run failed. ' + missing,
		state: 'blocked',
	}),
	building: render({ blueprintReady: false, state: 'building' }),
	complete: render({ blueprintReady: false, state: 'complete' }),
	preparing: render({
		activity: {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'running',
			reference: 'run_42',
		},
		blueprintReady: false,
		reason: 'The coding run is in progress.',
		state: 'preparing',
	}),
	queued: render({
		activity: {
			kind: 'pipeline',
			label: 'The Project intake pipeline',
			lifecycle: 'queued',
			reference: 'pipe_7',
		},
		blueprintReady: false,
		reason: 'The Project intake pipeline is queued and has not started. ' + missing,
		state: 'queued',
	}),
	ready: render({
		blueprintReady: true,
		firstFeature: { directory: 'first-feature', id: 'first-feature', title: 'First feature' },
		state: 'blueprint_ready',
	}),
	setupIncomplete: render({ blueprintReady: false, reason: missing, state: 'setup_incomplete' }),
	stopped: render({
		activity: {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'stopped',
			reference: 'run_9',
		},
		blueprintReady: false,
		reason: 'The coding run was stopped. ' + missing,
		state: 'blocked',
	}),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<RenderedCase, string>;
}

describe('blueprint implementation card', () => {
	const rendered = renderBlueprintCards();

	// The reported defect, at the surface it was reported on: an idle project with no runs and no
	// pipelines showed an animated spinner over "Preparing blueprint".
	test('an idle project reports incomplete setup with no spinner and no progress wording', () => {
		expect(rendered.setupIncomplete).toContain('Project setup incomplete');
		expect(rendered.setupIncomplete).toContain(
			'Project setup is incomplete: .aidd/spec.md and .aidd/CHANGELOG.md are missing.',
		);
		expect(rendered.setupIncomplete).not.toContain('animate-spin');
		expect(rendered.setupIncomplete).not.toContain('Preparing blueprint');
		expect(rendered.setupIncomplete).not.toContain('in progress');
	});

	test('the spinner belongs to running work and to nothing else', () => {
		expect(rendered.preparing).toContain('animate-spin');
		expect(rendered.preparing).toContain('Preparing blueprint');
		expect(rendered.preparing).toContain('The coding run is in progress.');
		for (const state of ['blocked', 'queued', 'ready', 'setupIncomplete', 'stopped'] as const) {
			expect(rendered[state]).not.toContain('animate-spin');
		}
	});

	test('queued work is labelled queued and still names what is missing', () => {
		expect(rendered.queued).toContain('Blueprint setup queued');
		expect(rendered.queued).toContain('is queued and has not started');
		expect(rendered.queued).toContain('.aidd/spec.md');
		expect(rendered.queued).not.toContain('in progress');
	});

	test('terminal work is described by what happened to it', () => {
		expect(rendered.stopped).toContain('Blueprint needs attention');
		expect(rendered.stopped).toContain('The coding run was stopped.');
		expect(rendered.blocked).toContain('The coding run failed.');
	});

	test('offers a way to check the claim without starting any work', () => {
		expect(rendered.preparing).toContain('/runs?project=D%3A%2Fapps%2Fsummon&amp;run=run_42');
		expect(rendered.preparing).toContain('Open run in Live Console');
		expect(rendered.queued).toContain('/pipeline-sessions/pipe_7');
		expect(rendered.setupIncomplete).toContain('Review project artifacts');
		for (const state of ['blocked', 'preparing', 'queued', 'setupIncomplete'] as const) {
			expect(rendered[state]).not.toContain('Start building');
		}
	});

	test('a ready blueprint keeps its existing start control', () => {
		expect(rendered.ready).toContain('Blueprint ready for review');
		expect(rendered.ready).toContain('Start building');
		expect(rendered.ready).toContain('First feature');
		expect(rendered.ready).not.toContain('animate-spin');
	});

	test('building and complete projects still render no card at all', () => {
		expect(rendered.building).toBe('');
		expect(rendered.complete).toBe('');
	});
});
