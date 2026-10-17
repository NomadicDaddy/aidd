import { collectDocsInputs } from '../../check-docs.ts';

/**
 * The `check:docs` input list. The gate's verdict depends on more than markdown: a link to a
 * non-markdown file, a target git ignores, and the .gitignore files that decide both. A glob over
 * every markdown file missed those and hashed markdown the gate never reads, so the gate itself
 * now says what it read (`collectDocsInputs`, delivered by smokestack) and the cache keys on that,
 * plus the gate's own files. An entry ending in `/` is a linked directory whose presence, not its
 * content, is the input; `hashDependencies` hashes it that way.
 */
export function collectDocsDependencies(projectRoot: string, toolInputs: string[]): string[] {
	return [...new Set([...toolInputs, ...collectDocsInputs(projectRoot)])].sort();
}
