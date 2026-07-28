import { basename, dirname } from 'node:path';

import type {
	FeatureStatusEntry,
	FeatureStatusSummaryEntry,
	RoadmapApplySummary,
} from '../aidd-workspace.ts';

type TableCellAlignment = 'left' | 'right';

interface FeatureStatusSummaryColumn {
	align: TableCellAlignment;
	header: string;
	value: (summary: FeatureStatusSummaryEntry) => string;
}

const featureStatusSummaryColumns: FeatureStatusSummaryColumn[] = [
	{
		align: 'left',
		header: 'Application',
		value: (summary) => summary.application,
	},
	{
		align: 'right',
		header: 'Audit',
		value: (summary) => String(summary.audit),
	},
	{
		align: 'right',
		header: 'Remediation',
		value: (summary) => String(summary.remediation),
	},
	{
		align: 'right',
		header: 'Feature',
		value: (summary) => String(summary.feature),
	},
	{
		align: 'right',
		header: 'Pending',
		value: (summary) => String(summary.pending),
	},
	{
		align: 'right',
		header: 'Completed',
		value: (summary) => String(summary.completed),
	},
	{
		align: 'right',
		header: 'Total',
		value: (summary) => String(summary.total),
	},
];

function padTableCell(value: string, width: number, alignment: TableCellAlignment): string {
	return alignment === 'right' ? value.padStart(width) : value.padEnd(width);
}

function formatFeatureStatusSummaryTable(summaries: FeatureStatusSummaryEntry[]): string {
	const columns = featureStatusSummaryColumns.map((column) => ({
		...column,
		width: Math.max(
			column.header.length,
			...summaries.map((summary) => column.value(summary).length),
		),
	}));

	const header = columns
		.map((column) => padTableCell(column.header, column.width, column.align))
		.join('  ');
	const rows = summaries.map((summary) =>
		columns
			.map((column) => padTableCell(column.value(summary), column.width, column.align))
			.join('  '),
	);

	return [header, ...rows].join('\n');
}

function formatFeatureStatusEntries(entries: FeatureStatusEntry[]): string {
	if (entries.length === 0) return '';
	const applicationWidth = Math.max(...entries.map((entry) => entry.application.length));
	return entries
		.map((entry) =>
			[
				padTableCell(entry.application, applicationWidth, 'left'),
				basename(dirname(entry.path)),
			].join(' '),
		)
		.join('\n');
}

function printRoadmapApplySummary(summary: RoadmapApplySummary): void {
	for (const warning of summary.warnings) console.warn(`WARNING: ${warning}`);
	for (const error of summary.errors) console.error(`ERROR: ${error}`);
	console.log('');
	console.log(
		summary.dryRun ? `Dry Run Summary (${summary.appName})` : `Summary (${summary.appName})`,
	);
	console.log(`  Updated:   ${summary.updated}`);
	console.log(`  Unchanged: ${summary.skipped}`);
	console.log(`  Missing:   ${summary.missing}`);
	console.log(`  Total:     ${summary.total}`);
	console.log(`  Dependencies written:   ${summary.dependenciesWritten}`);
	console.log(`  Dependencies preserved: ${summary.dependenciesPreserved}`);
	console.log('');
	for (const milestone of summary.milestones) {
		const description =
			milestone.description === undefined ? '' : ` - ${milestone.description}`;
		console.log(
			`  Priority ${milestone.priority} (${milestone.milestone}${description}): ${milestone.count} features`,
		);
	}
	console.log(`  Total mapped: ${summary.total}`);
}

export { formatFeatureStatusEntries, formatFeatureStatusSummaryTable, printRoadmapApplySummary };
