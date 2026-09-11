import { gitOutput, gitSuccess } from './git-exec.ts';

/** Stands in for the feature records: `check-ignore` matches patterns, so the file need not exist. */
const FEATURE_RECORD_PROBE = '.aidd/features/probe/feature.json';

/** Whether this project's `.aidd/` metadata is tracked by git. `false` means the repository
 * gitignores it; `undefined` means git could not answer (no repo, no git binary) or the metadata is
 * simply not committed yet, and the prompt should stay silent rather than assert either way.
 *
 * Worth a probe because the alternative is every iteration rediscovering it: in a repo that
 * gitignores `.aidd/`, agents reliably burn three commands (`ls-files --error-unmatch` fails, then
 * `check-ignore` twice) before concluding the on-disk feature.json is the only record there is.
 *
 * Untracked is not the same as ignored. A from-idea project has no `.aidd/` in git until the
 * initializer commits its blueprint, and telling that initializer the metadata is gitignored had
 * it keep the blueprint out of every commit, so the tree never came clean and the run looped
 * without ever reaching implementation. */
export async function aiddMetadataTracked(projectDir: string): Promise<boolean | undefined> {
	const output = await gitOutput(projectDir, ['ls-files', '--', '.aidd']);
	if (output === undefined) return undefined;
	if (output.trim().length > 0) return true;
	return (await gitSuccess(projectDir, ['check-ignore', '-q', '--', FEATURE_RECORD_PROBE]))
		? false
		: undefined;
}
