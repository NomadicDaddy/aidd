import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * No hook polls faster than every five seconds without saying why. WebSocket invalidation is the
 * panel's live signal; a poll is a backstop for a missed broadcast, and a three-second backstop on
 * a key the socket already covers is a request every three seconds for nothing. A faster poll is
 * allowed only with a `poll-justified:` comment within the three lines above it.
 */
const FLOOR_MS = 5_000;
const hooks = resolve(process.cwd(), 'frontend', 'src', 'hooks');

test('polls under five seconds carry a justification', () => {
	const offenders: string[] = [];
	for (const entry of readdirSync(hooks)) {
		if (!/\.tsx?$/.test(entry)) continue;
		const lines = readFileSync(join(hooks, entry), 'utf8').split('\n');
		lines.forEach((line, index) => {
			const match =
				/_POLL_MS\s*=\s*([\d_]+)/.exec(line) ?? /refetchInterval:\s*([\d_]+)/.exec(line);
			if (!match?.[1]) return;
			const ms = Number(match[1].replaceAll('_', ''));
			const justified = lines
				.slice(Math.max(0, index - 3), index)
				.join('\n')
				.includes('poll-justified:');
			if (ms < FLOOR_MS && !justified)
				offenders.push(`${entry}:${index + 1} polls every ${ms} ms`);
		});
	}
	expect(offenders).toEqual([]);
});
