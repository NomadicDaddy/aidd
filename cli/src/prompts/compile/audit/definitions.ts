import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseFrontmatter, stripAuditPromptFrontmatter } from '../frontmatter.ts';

export interface AuditPromptDefinition {
	body: string;
	category: string;
	name: string;
	nameLower: string;
}

// Trust boundary: `rootDir` is the aidd installation, so `audits/*.md` is the shipped
// catalog — trusted install content spliced raw into the prompt below. A future loader
// that reads audit definitions from a target project directory instead must NOT inherit
// this raw splice; project-writable content needs the fenced/untrusted treatment that
// prior-context.ts applies.
export async function loadAuditPromptDefinition(
	rootDir: string,
	auditName: string,
): Promise<AuditPromptDefinition> {
	const auditFile = join(rootDir, 'audits', `${auditName}.md`);
	let auditMarkdown: string;
	try {
		auditMarkdown = await readFile(auditFile, 'utf8');
	} catch {
		auditMarkdown = '';
	}
	const frontmatter = parseFrontmatter(auditMarkdown);
	return {
		body: stripAuditPromptFrontmatter(auditMarkdown),
		category: frontmatter.category ?? 'Audit',
		name: auditName,
		nameLower: auditName.toLowerCase().replaceAll('_', '-'),
	};
}

export function compileBatchAuditGuidelines(definitions: AuditPromptDefinition[]): string {
	return definitions
		.map((definition, index) =>
			[
				`## SELECTED AUDIT ${index + 1}: ${definition.name}`,
				'',
				`**Audit Source:** ${definition.name}`,
				`**Default Category:** ${definition.category}`,
				`**Finding ID Prefix:** audit-${definition.nameLower}-{timestamp}-{slug}`,
				'',
				definition.body.trim() || '_No audit definition body was found._',
				'',
			].join('\n'),
		)
		.join('\n---\n\n');
}
