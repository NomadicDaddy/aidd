import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface StackDeclaration {
	family: string;
	label: string;
}

const MARKER_RE = /\[([a-z0-9][a-z0-9+._/-]*)\]/gi;

async function readText(path: string): Promise<null | string> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

function normalizeMarker(marker: string): string {
	return marker.trim().toLowerCase().replace(/_/g, '-');
}

function titlePart(value: string): string {
	const known = new Map([
		['.net', '.NET'],
		['convex', 'Convex'],
		['javascript', 'JavaScript'],
		['node', 'Node.js'],
		['node.js', 'Node.js'],
		['php', 'PHP'],
		['pode', 'Pode'],
		['powershell', 'PowerShell'],
		['react', 'React'],
		['typescript', 'TypeScript'],
		['vite', 'Vite'],
	]);
	return (
		known.get(value) ??
		value
			.split('-')
			.filter(Boolean)
			.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
			.join(' ')
	);
}

export function declarationFor(marker: string): StackDeclaration {
	const normalized = normalizeMarker(marker);
	if (normalized === 'spernakit-lite') {
		return { family: 'spernakit-lite', label: 'Spernakit Lite' };
	}
	if (normalized === 'spernakit' || normalized.startsWith('spernakit+')) {
		const variant = normalized.split('+')[1];
		return {
			family: 'spernakit',
			label: variant ? `Spernakit + ${titlePart(variant)}` : 'Spernakit',
		};
	}
	const knownFamilies = new Map<string, StackDeclaration>([
		['powershell+pode', { family: 'powershell-pode', label: 'PowerShell/Pode' }],
		['react+convex', { family: 'react-convex', label: 'React/Convex' }],
		['react+vite', { family: 'react-vite', label: 'React/Vite' }],
		['vue+vite', { family: 'vue-vite', label: 'Vue/Vite' }],
	]);
	const known = knownFamilies.get(normalized);
	if (known) return known;
	const parts = normalized.split('+').filter(Boolean);
	return {
		family: normalized || 'custom',
		label: parts.length > 0 ? parts.map(titlePart).join('/') : marker.trim(),
	};
}

function markerIsNegated(line: string, markerIndex: number): boolean {
	return /(?:\bnot|\bnon)\s*$|\brather\s+than\s*$/i.test(line.slice(0, markerIndex));
}

function positiveMarkers(line: string): string[] {
	const markers: string[] = [];
	for (const match of line.matchAll(MARKER_RE)) {
		if (!match[1] || match.index === undefined) continue;
		if (line[match.index + match[0].length] === '(') continue;
		if (!markerIsNegated(line, match.index)) markers.push(match[1]);
	}
	return markers;
}

function normalizedCell(cell: string): string {
	return cell.trim().replace(/\\/g, '').replace(/[*`]/g, '').trim().toLowerCase();
}

export function extractProjectStackDeclaration(
	doc: string,
	projectDir: string,
	isProjectLocal: boolean
): null | StackDeclaration {
	const projectName = basename(projectDir).toLowerCase();
	for (const line of doc.split('\n')) {
		const markers = positiveMarkers(line);
		if (markers.length === 0) continue;
		const isTableRow = /^\s*\|/.test(line);
		if (isTableRow) {
			const cells = line.split('|').map(normalizedCell);
			const matchesProject = cells.some((cell) => {
				if (cell === projectName) return true;
				return normalizedCell(cell.split(/[\\/]/).pop() ?? '') === projectName;
			});
			if (matchesProject) return declarationFor(markers[0] as string);
			continue;
		}
		const explicitStack = /^\s*(?:[-*]\s*)?(?:\*\*)?stack(?:\*\*)?\s*:/i.test(line);
		const lineWithoutMarkers = line.replace(/\[[a-z0-9][a-z0-9+._/-]*\]/gi, '');
		const namesProject = lineWithoutMarkers.toLowerCase().includes(projectName);
		if ((isProjectLocal && explicitStack) || namesProject) {
			return declarationFor(markers[0] as string);
		}
	}
	return null;
}

export async function readProjectStackDeclaration(
	directory: string,
	projectDir: string,
	isProjectLocal: boolean
): Promise<null | StackDeclaration> {
	for (const name of ['AGENTS.md', 'CLAUDE.md']) {
		const text = await readText(join(directory, name));
		if (text === null) continue;
		const declaration = extractProjectStackDeclaration(text, projectDir, isProjectLocal);
		if (declaration) return declaration;
	}
	return null;
}

export function manifestEntryVersion(manifestText: string, slug: string): null | string {
	const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const entry = new RegExp(`'${escapedSlug}'\\s*=\\s*@\\{([^}]*)\\}`, 'i').exec(manifestText);
	if (!entry?.[1]) return null;
	return /spernakit_version\s*=\s*'([^']*)'/i.exec(entry[1])?.[1] ?? '';
}

export async function isSpernakitFleetMember(path: string, slug: string): Promise<boolean> {
	const text = await readText(path);
	return text !== null && manifestEntryVersion(text, slug) !== null;
}
