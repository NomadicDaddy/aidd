export interface YamlFrontmatter {
	contentStart: number;
	values: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function yamlFrontmatterFrom(body: string): YamlFrontmatter {
	if (!body.startsWith('---')) {
		throw new Error('Markdown content must begin with YAML frontmatter');
	}
	const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match?.[1]) throw new Error('Markdown content has malformed YAML frontmatter');
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(match[1]);
	} catch (error) {
		throw new Error(
			`Markdown content has invalid YAML frontmatter: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
	if (!isRecord(parsed)) throw new Error('Markdown frontmatter must be a YAML mapping');
	return { contentStart: match[0].length, values: parsed };
}

export function optionalFrontmatterStrings(body: string): Record<string, string> {
	if (!body.startsWith('---')) return {};
	try {
		const { values } = yamlFrontmatterFrom(body);
		return Object.fromEntries(
			Object.entries(values).flatMap(([key, value]) =>
				typeof value === 'string' ? [[key, value]] : []
			)
		);
	} catch {
		return {};
	}
}
