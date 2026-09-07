export function parseFrontmatter(markdown: string): Record<string, string> {
	if (!markdown.startsWith('---')) return {};
	const end = markdown.indexOf('\n---', 3);
	if (end === -1) return {};
	const frontmatter = markdown.slice(3, end);
	const entries: [string, string][] = [];
	for (const line of frontmatter.split(/\r?\n/)) {
		const match = line.match(/^([A-Za-z0-9_-]+):\s*['"]?([^'"]*)['"]?\s*$/);
		if (match?.[1]) entries.push([match[1], match[2] ?? '']);
	}
	return Object.fromEntries(entries);
}

export function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---')) return markdown;
	const end = markdown.indexOf('\n---', 3);
	if (end === -1) return markdown;
	return markdown.slice(end + 4).replace(/^\r?\n/, '');
}

export function stripAuditPromptFrontmatter(markdown: string): string {
	const withoutFrontmatter = stripFrontmatter(markdown);
	const lines = withoutFrontmatter.split(/\r?\n/);
	const separatorIndex = lines.findIndex((line) => line === '---');
	if (separatorIndex === -1) return withoutFrontmatter;
	return `${lines
		.slice(separatorIndex + 1)
		.join('\n')
		.replace(/^\r?\n/, '')}\n`;
}
