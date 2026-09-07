import { describe, expect, test } from 'bun:test';

const canonicalName = 'aidd';
const displayVariants = [
	`${canonicalName.slice(0, 2).toUpperCase()}${canonicalName.slice(2)}`,
	`${canonicalName[0]?.toUpperCase()}${canonicalName.slice(1)}`,
];

function trackedMatches(variant: string): string[] {
	const result = Bun.spawnSync(['git', 'grep', '-n', '-I', '-w', variant, '--', ':!bun.lock'], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode === 1) return [];
	expect(result.exitCode, result.stderr.toString()).toBe(0);
	return result.stdout.toString().trim().split(/\r?\n/).filter(Boolean);
}

describe('display branding', () => {
	test('uses the lowercase product name outside preserved protocol headers', () => {
		const uppercaseName = displayVariants[0] ?? '';
		const protocolPrefix = `X-${uppercaseName}`;
		const unexpected = displayVariants.flatMap((variant) =>
			trackedMatches(variant).filter((match) => {
				const content = match.replace(/^.*?:\d+:/, '').replaceAll(protocolPrefix, '');
				return new RegExp(`\\b${variant}\\b`).test(content);
			}),
		);

		expect(unexpected).toEqual([]);
	});
});
