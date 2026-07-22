/**
 * Loads the bundled documentation markdown. This is the ONLY module that uses
 * Vite's `import.meta.glob`, so tests (which can't parse that syntax) must read
 * the markdown from disk instead of importing this file. The raw `.md` strings
 * are inlined into the docs chunk at build time, so no backend or filesystem
 * access is needed at runtime in any deployment mode.
 */

const modules = import.meta.glob('../../../content/docs/*.md', {
	eager: true,
	import: 'default',
	query: '?raw',
});

const bySlug = new Map<string, string>();
for (const [path, content] of Object.entries(modules)) {
	const slug = path.split('/').pop()!.replace(/\.md$/, '');
	bySlug.set(slug, String(content));
}

/** Return the raw markdown for a doc slug, or undefined if none is bundled. */
export function getDocBody(slug: string): string | undefined {
	return bySlug.get(slug);
}
