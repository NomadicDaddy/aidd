// Pure Markdown text helpers for the skill catalog. YAML frontmatter parsing
// lives in shared/src/markdown so diary parsing does not depend on this module.

export function firstHeading(body: string, fallback: string): string {
	const match = body.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim() || fallback;
}

function sectionBody(body: string, heading: string): string {
	const pattern = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
	const match = pattern.exec(body);
	if (!match) return '';
	const start = match.index + match[0].length;
	const rest = body.slice(start);
	const next = rest.search(/^##\s+/m);
	return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function usageFrom(body: string): string {
	const usage = sectionBody(body, 'Usage');
	const codeMatch = usage.match(/```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/);
	return (codeMatch?.[1] ?? usage).trim();
}
