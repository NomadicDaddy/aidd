import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ToolCommand } from './options.ts';

import {
	ensureChangelog,
	runAiddAudit,
	runFeatureAuditGeneration,
	runFeatureReviewSweep,
	runFeatureStatus,
	runFleetCheck,
	runPreRebuild,
	runRoadmapApply,
	runValidateAuditProfileMapping,
} from './runners.ts';

async function writeToolIndex(argv: string[]): Promise<number> {
	const outputIndex = argv.indexOf('--output');
	if (outputIndex === -1) throw new Error('--output requires a value');
	const outputPath = argv[outputIndex + 1];
	if (!outputPath) throw new Error('--output requires a value');
	const unknown = argv.filter((_, index) => index !== outputIndex && index !== outputIndex + 1);
	if (unknown.length > 0) throw new Error(`Unknown index option(s): ${unknown.join(' ')}`);

	const lines = [
		'# aidd Tools',
		'',
		'Single entrypoint commands:',
		'',
		...commands.map((command) => `- \`${command.name}\` - ${command.description}`),
		'',
	];
	await mkdir(dirname(resolve(outputPath)), { recursive: true });
	await writeFile(resolve(outputPath), lines.join('\n'));
	console.log(`Wrote ${resolve(outputPath)}`);
	return 0;
}

const commands: ToolCommand[] = [
	{
		aliases: ['audit-parity'],
		description: 'Run the UI_PARITY audit workflow, which generates parity findings.',
		name: 'audit:ui-parity',
		run: (argv) => runAiddAudit('UI_PARITY', argv),
		usage: 'bun run aidd-tools -- audit:ui-parity --project-dir <dir> [aidd args]',
	},
	{
		aliases: ['template-diff'],
		description: 'Run the SPERNAKIT audit workflow for template drift analysis.',
		name: 'template:diff',
		run: (argv) => runAiddAudit('SPERNAKIT', argv),
		usage: 'bun run aidd-tools -- template:diff --project-dir <dir> [aidd args]',
	},
	{
		aliases: ['feature-generation'],
		description: 'Run a named audit workflow that can generate audit feature files.',
		name: 'features:from-audit',
		run: runFeatureAuditGeneration,
		usage: 'bun run aidd-tools -- features:from-audit --audit <name> --project-dir <dir> [aidd args]',
	},
	{
		description: 'Run the cross-application feature-review sweep tool.',
		name: 'features:review-sweep',
		run: runFeatureReviewSweep,
		usage: 'bun run aidd-tools -- features:review-sweep [feature-review-sweep args]',
	},
	{
		description: 'List or summarize project feature status across applications.',
		name: 'features:status',
		run: runFeatureStatus,
		usage: 'bun run aidd-tools -- features:status [--applications-root <dir>] [--application <name[,name]>] [--pending|--completed] [--type audit,remediation,feature] [--summary]',
	},
	{
		description: 'Run no-LLM feature and artifact checks across discovered applications.',
		name: 'fleet:check',
		run: runFleetCheck,
		usage: 'bun run aidd-tools -- fleet:check [--applications-root <dir>] [--application <name[,name]>]',
	},
	{
		aliases: ['changelog-generation'],
		description: 'Read or create a project .aidd/CHANGELOG.md skeleton.',
		name: 'changelog:ensure',
		run: ensureChangelog,
		usage: 'bun run aidd-tools -- changelog:ensure --project-dir <dir> [--write]',
	},
	{
		description: 'Run no-LLM feature and artifact checks before rebuild work.',
		name: 'pre-rebuild',
		run: runPreRebuild,
		usage: 'bun run aidd-tools -- pre-rebuild --project-dir <dir>',
	},
	{
		description:
			'Validate audits/audit-profile-mapping.json against the audit catalog and shared schema.',
		name: 'audit:profile-mapping',
		run: runValidateAuditProfileMapping,
		usage: 'bun run aidd-tools -- audit:profile-mapping',
	},
	{
		description:
			'Apply roadmap milestone priorities and resolved dependency ids to feature files.',
		name: 'roadmap:apply',
		run: runRoadmapApply,
		usage: 'bun run aidd-tools -- roadmap:apply --project-dir <dir> [--dry-run]',
	},
	{
		description: 'Write a markdown index of the consolidated aidd-tools commands.',
		name: 'index:write',
		run: writeToolIndex,
		usage: 'bun run aidd-tools -- index:write --output <path>',
	},
];

function findCommand(name: string): ToolCommand | undefined {
	return commands.find((command) => command.name === name || command.aliases?.includes(name));
}

function printHelp(): void {
	console.log(`aidd-tools

Usage:
  bun run aidd-tools -- <command> [args]

Commands:
${commands.map((command) => `  ${command.name.padEnd(22)} ${command.description}`).join('\n')}

Use a command with --help only when the delegated tool supports it.
`);
}

export { commands, findCommand, printHelp };
