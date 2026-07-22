import type {
	ProjectReportKind,
	ProjectReportMetadataDto,
	ProjectReportSubmitDto,
} from '../../types.ts';

export const REPORT_SOURCE = 'aidd-web-report';

const REQUEST_TERMS = [
	'no way to',
	'need a way to',
	'needs a way to',
	'should be able to',
	'missing',
	'add',
	'allow',
	'let me',
	'want',
];
const BROKEN_TERMS = [
	'bad',
	'blocked',
	'broken',
	'cannot',
	"can't",
	'crash',
	'does not',
	"doesn't",
	'error',
	'fail',
	'is not working',
	"isn't working",
	'not working',
	'stuck',
	'violates',
	'wrong',
];
const STOP_WORDS = new Set([
	'a',
	'add',
	'an',
	'and',
	'are',
	'as',
	'be',
	'for',
	'from',
	'i',
	'in',
	'is',
	'it',
	'no',
	'of',
	'on',
	'or',
	'should',
	'that',
	'the',
	'there',
	'this',
	'to',
	'way',
	'with',
]);

export interface ReportFeatureMetadata {
	classificationReason: string;
	createdAt: string;
	createdFeatureKind: ProjectReportKind;
	metadata?: ProjectReportMetadataDto;
	originalKind: ProjectReportKind;
	reportedBy: {
		username: string;
	};
	source: typeof REPORT_SOURCE;
}

export interface ClassificationResult {
	featureKind: ProjectReportKind;
	reason: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesAnyTerm(value: string, terms: string[]): boolean {
	return terms.some((term) => value.includes(term));
}

export function classifyReport(report: ProjectReportSubmitDto): ClassificationResult {
	if (report.kind === 'feature') {
		return {
			featureKind: 'feature',
			reason: 'Submitted as a feature request.',
		};
	}

	const normalizedDescription = report.description.toLowerCase();
	const hasRequestTerm = includesAnyTerm(normalizedDescription, REQUEST_TERMS);
	const hasBrokenTerm = includesAnyTerm(normalizedDescription, BROKEN_TERMS);

	if (hasRequestTerm && !hasBrokenTerm) {
		return {
			featureKind: 'feature',
			reason: 'Bug submission used capability-request wording without clear broken-behavior wording.',
		};
	}

	return {
		featureKind: 'bug',
		reason: hasBrokenTerm
			? 'Bug submission contained broken-behavior wording.'
			: 'Bug submission did not match feature-request wording.',
	};
}

export function titleFromDescription(description: string): string {
	const firstLine = description.trim().split(/\r?\n/, 1)[0] ?? 'Submitted report';
	const clipped = firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}...` : firstLine;
	return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

export function slugFromDescription(description: string): string {
	const words = description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0 && !STOP_WORDS.has(word));
	const slug = words.slice(0, 6).join('-') || 'submitted-report';
	const safeSlug = /^[a-z]/.test(slug) ? slug : `report-${slug}`;
	return safeSlug.slice(0, 64).replace(/-+$/g, '') || 'submitted-report';
}
