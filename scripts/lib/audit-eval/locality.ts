import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import type { AuditEvalCatalog, AuditEvalSite, AuditEvalSymbolSpan } from '../benchmark/types.ts';

export interface AuditEvalLocality {
	spans: readonly AuditEvalSymbolSpan[];
	workspaceDir?: string;
}

function normalize(value: string): string {
	return value.replaceAll('\\', '/').toLowerCase();
}

function functionSpans(file: string, source: string): AuditEvalSymbolSpan[] {
	const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const spans: AuditEvalSymbolSpan[] = [];
	function visit(node: ts.Node): void {
		if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
			spans.push({
				endLine: parsed.getLineAndCharacterOfPosition(node.end - 1).line + 1,
				file,
				startLine: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
				symbol: node.name.text,
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(parsed);
	return spans;
}

function fixtureSpans(fixtureDir: string, file: string): AuditEvalSymbolSpan[] {
	try {
		const root = realpathSync(fixtureDir);
		const target = realpathSync(path.resolve(root, file));
		const relative = path.relative(root, target);
		if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
			return [];
		return functionSpans(file, readFileSync(target, 'utf8'));
	} catch {
		return [];
	}
}

/** Resolve only unique function declarations. Missing or ambiguous symbols keep identifier-only
 * matching. Call before executing the agent, never against its potentially edited checkout. */
export function resolveAuditSymbolSpans(
	fixtureDir: string,
	catalog: AuditEvalCatalog | undefined,
): AuditEvalSymbolSpan[] {
	if (catalog === undefined) return [];
	const sites = [...catalog.defects, ...catalog.decoys];
	return sites.flatMap((site) => {
		if (site.symbol === undefined) return [];
		const matches = fixtureSpans(fixtureDir, site.file).filter(
			(span) => span.symbol === site.symbol,
		);
		return matches.length === 1 ? matches : [];
	});
}

function citationInSpan(
	citation: RegExpMatchArray,
	span: AuditEvalSymbolSpan,
	workspaceDir?: string,
): boolean {
	const file = citation[1]!;
	const relative =
		path.isAbsolute(file) && workspaceDir !== undefined
			? path.relative(workspaceDir, file)
			: path.normalize(file.replaceAll('\\', '/'));
	const line = Number(citation[2]);
	return (
		normalize(relative) === normalize(span.file) &&
		line >= span.startLine &&
		line <= span.endLine
	);
}

/** Same-file citations inside the exact function span count without requiring its identifier.
 * No line tolerance is applied: neighboring functions and their decoys remain separate. */
export function citesAuditSymbol(
	text: string,
	site: AuditEvalSite,
	locality: AuditEvalLocality | undefined,
): boolean {
	if (locality === undefined || site.symbol === undefined) return false;
	const matches = locality.spans.filter(
		(span) => normalize(span.file) === normalize(site.file) && span.symbol === site.symbol,
	);
	if (matches.length !== 1) return false;
	const span = matches[0]!;
	const citations = text.matchAll(
		/((?:[A-Za-z]:)?[\\/]{0,2}(?:[\w.@+-]+[\\/])*[\w.@+-]+\.[A-Za-z0-9]+):(\d{1,6})\b/g,
	);
	return [...citations].some((citation) => citationInSpan(citation, span, locality.workspaceDir));
}
