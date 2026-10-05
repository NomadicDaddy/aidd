/** Path lookups over the loosely shaped JSON envelopes the plain parser reads. */
export function getPath(value: unknown, path: string[]): unknown {
	let current = value;
	for (const segment of path) {
		if (typeof current !== 'object' || current === null || !(segment in current))
			return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

export function firstString(value: unknown, paths: string[][]): string | undefined {
	for (const path of paths) {
		const candidate = getPath(value, path);
		if (typeof candidate === 'string' && candidate.length > 0) return candidate;
	}
	return undefined;
}

export function firstNumber(value: unknown, paths: string[][]): number | undefined {
	for (const path of paths) {
		const candidate = getPath(value, path);
		if (typeof candidate === 'number') return candidate;
	}
	return undefined;
}
