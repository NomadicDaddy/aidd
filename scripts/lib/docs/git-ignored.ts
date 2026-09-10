/**
 * What git ignores, answered for a whole list in one call.
 *
 * `check-docs` asks twice, for two different reasons. Markdown inside an ignored tree is not this
 * repository's documentation and its links are not this repository's to validate. A link whose
 * target is ignored is the opposite case: the target is right here, and the link still fails for
 * everyone else, because CI and every fresh clone resolve it against a tree without the file.
 *
 * Both calls fall open when git cannot answer (not a repository, git missing), so scanning outside
 * a checkout behaves as it did before this existed.
 *
 * One `--stdin` call rather than one per path. The per-path form cost about nine seconds in the
 * largest carrier, enough to exceed the default per-test timeout.
 *
 * A tracked file that happens to match an ignore rule is not reported, because `check-ignore`
 * consults the index. That is the answer this gate wants: the question is whether a fresh clone
 * would have the file, not whether a pattern matches its name.
 */

import { relative, sep } from 'node:path';

/** Path from the project root, with forward slashes, so paths read the same on either OS. */
export function toPosixRelative(projectRoot: string, path: string): string {
	return relative(projectRoot, path).split(sep).join('/');
}

/** The members of `relatives` that git ignores, empty when git could not answer. */
export function gitIgnored(projectRoot: string, relatives: string[]): Set<string> {
	if (relatives.length === 0) return new Set();
	const result = Bun.spawnSync(['git', 'check-ignore', '-z', '--stdin'], {
		cwd: projectRoot,
		stderr: 'ignore',
		stdin: Buffer.from(`${relatives.join('\0')}\0`),
		windowsHide: true,
	});
	// 0 = some path is ignored, 1 = none are, anything else = git could not answer.
	if (result.exitCode !== 0) return new Set();
	return new Set(result.stdout.toString().split('\0').filter(Boolean));
}
