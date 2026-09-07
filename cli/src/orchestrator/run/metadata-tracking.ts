import { gitOutput } from './git-exec.ts';

/** Whether this project's `.aidd/` metadata is tracked by git. `undefined` means git could not
 * answer (no repo, no git binary) and the prompt should stay silent rather than assert either way.
 *
 * Worth a probe because the alternative is every iteration rediscovering it: in a repo that
 * gitignores `.aidd/`, agents reliably burn three commands (`ls-files --error-unmatch` fails, then
 * `check-ignore` twice) before concluding the on-disk feature.json is the only record there is. */
export async function aiddMetadataTracked(projectDir: string): Promise<boolean | undefined> {
	const output = await gitOutput(projectDir, ['ls-files', '--', '.aidd']);
	if (output === undefined) return undefined;
	return output.trim().length > 0;
}
