import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseFrontmatter, stripAuditPromptFrontmatter } from '../frontmatter.ts';

interface AuditPromptDefinition {
	body: string;
	category: string;
	nameLower: string;
}

// Trust boundary: `rootDir` is the aidd installation, so `audits/*.md` is the shipped
// catalog, selected only by its restricted catalog name — trusted install content spliced raw
// into the prompt below. Path separators and traversal cannot reach the filesystem. A future loader
// that reads audit definitions from a target project directory instead must NOT inherit
// this raw splice; project-writable content needs the fenced/untrusted treatment that
// prior-context.ts applies.
export async function loadAuditPromptDefinition(
	rootDir: string,
	auditName: string,
): Promise<AuditPromptDefinition> {
	if (!/^[A-Z0-9_]+$/.test(auditName)) throw new Error('Invalid audit name.');
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
		nameLower: auditName.toLowerCase().replaceAll('_', '-'),
	};
}
