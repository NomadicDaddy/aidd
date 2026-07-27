import { expect, test } from 'bun:test';

import { readRunHistorySources } from '../../backend/src/services/run/historySourceReads.ts';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	if (!resolvePromise) throw new Error('deferred resolver was not initialized');
	return { promise, resolve: resolvePromise };
}

test('starts every independent run-history source before awaiting delayed results', async () => {
	const started: string[] = [];
	const web = deferred<string[]>();
	const cli = deferred<string[]>();
	const director = deferred<string[]>();

	const resultPromise = readRunHistorySources({
		cli: () => {
			started.push('cli');
			return cli.promise;
		},
		director: () => {
			started.push('director');
			return director.promise;
		},
		web: () => {
			started.push('web');
			return web.promise;
		},
	});

	expect(started).toEqual(['web', 'cli', 'director']);

	cli.resolve(['cli-running']);
	director.resolve(['director-completed']);
	web.resolve(['web-newest', 'web-older']);

	expect(await resultPromise).toEqual({
		cliItems: ['cli-running'],
		directorItems: ['director-completed'],
		webItems: ['web-newest', 'web-older'],
	});
});
