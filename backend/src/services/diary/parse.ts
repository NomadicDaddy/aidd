import { optionalFrontmatterStrings } from 'aidd-shared/markdown/frontmatter';
import { firstHeading } from 'aidd-shared/skills/markdown';

// Pure parsing for diary entry markdown files. No filesystem access — callers stat/read and
// pass the raw body in. A malformed file returns an { error } object rather than throwing, so a
// single bad file can never break a whole-project reconcile.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DIARY_PHASES = new Set([
	'Architecture',
	'Backend',
	'Bugfix',
	'Collector',
	'DevOps',
	'Frontend',
	'Research',
	'Template',
	'Tooling',
]);

export interface ParsedDiaryEntry {
	bodyMd: string;
	contentHash: string;
	entryDate: string;
	fileMtimeMs: number;
	filePath: string;
	generatedBy: null | string;
	id: string;
	phase: null | string;
	projectName: string;
	projectPath: string;
	summary: null | string;
	title: string;
}

export interface ParseDiaryEntryInput {
	body: string;
	entryDate: string;
	fileMtimeMs: number;
	filePath: string;
	projectName: string;
	projectPath: string;
}

// Win32-style fold used for the deterministic id and for project filtering, matching the
// '/'→'\' + lowercase normalization runs/pipeline queries apply (see historyQueries
// projectPathFilter). Applied on every platform so a project's id stays stable regardless of
// the slash/casing variant a caller passes.
function foldProjectPath(projectPath: string): string {
	return projectPath.replaceAll('/', '\\').toLowerCase();
}

export function diaryEntryId(projectPath: string, entryDate: string): string {
	return `${entryDate}|${foldProjectPath(projectPath)}`;
}

export function parseDiaryEntry(input: ParseDiaryEntryInput): { error: string } | ParsedDiaryEntry {
	if (!DATE_PATTERN.test(input.entryDate)) {
		return { error: `Invalid entry date derived from path: ${input.entryDate}` };
	}
	const values = optionalFrontmatterStrings(input.body);
	const frontmatterDate = values.date?.trim();
	if (frontmatterDate && frontmatterDate !== input.entryDate) {
		return {
			error: `Frontmatter date ${frontmatterDate} does not match path date ${input.entryDate}`,
		};
	}
	const title = (values.title?.trim() || firstHeading(input.body, '')).trim();
	if (!title) {
		return { error: 'Entry has no title (frontmatter title or H1 heading required)' };
	}
	const phaseRaw = values.phase?.trim();
	const phase = phaseRaw && DIARY_PHASES.has(phaseRaw) ? phaseRaw : null;
	const summary = values.summary?.trim() || null;
	const generatedBy = values.generatedBy?.trim() || null;
	return {
		bodyMd: input.body,
		contentHash: Bun.hash(input.body).toString(16),
		entryDate: input.entryDate,
		fileMtimeMs: input.fileMtimeMs,
		filePath: input.filePath,
		generatedBy,
		id: diaryEntryId(input.projectPath, input.entryDate),
		phase,
		projectName: input.projectName,
		projectPath: input.projectPath,
		summary,
		title,
	};
}
