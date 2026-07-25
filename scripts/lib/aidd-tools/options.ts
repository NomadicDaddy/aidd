import { resolve } from 'node:path';

import {
	type FeatureStatusState,
	type FeatureStatusType,
	featureStatusTypes,
} from '../aidd-workspace.ts';
import { applicationsRoot } from './paths.ts';

interface ToolCommand {
	aliases?: string[];
	description: string;
	name: string;
	run: (argv: string[]) => Promise<number>;
	usage: string;
}

interface ProjectOptions {
	projectDir: string;
	rest: string[];
}

interface ApplicationsOptions {
	applications?: string[];
	applicationsRoot: string;
	rest: string[];
}

interface FeatureStatusCommandOptions extends ApplicationsOptions {
	state?: FeatureStatusState;
	summary: boolean;
	types?: FeatureStatusType[];
}

function requireOptionValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith('--')) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

function splitList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function takeApplicationsOptions(argv: string[]): ApplicationsOptions {
	let selectedApplications: string[] | undefined;
	let selectedRoot = applicationsRoot;
	const rest: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--applications-root') {
			selectedRoot = resolve(requireOptionValue(argv, index, arg));
			index++;
		} else if (arg === '--application') {
			selectedApplications = [
				...(selectedApplications ?? []),
				...splitList(requireOptionValue(argv, index, arg)),
			];
			index++;
		} else if (arg !== undefined) {
			rest.push(arg);
		}
	}
	return {
		...(selectedApplications !== undefined ? { applications: selectedApplications } : {}),
		applicationsRoot: selectedRoot,
		rest,
	};
}

function takeFeatureStatusOptions(argv: string[]): FeatureStatusCommandOptions {
	const base = takeApplicationsOptions(argv);
	let state: FeatureStatusState | undefined;
	let summary = false;
	let types: FeatureStatusType[] | undefined;
	const rest: string[] = [];
	for (let index = 0; index < base.rest.length; index++) {
		const arg = base.rest[index];
		if (arg === '--pending') {
			if (state === 'completed')
				throw new Error('Specify only one of --pending or --completed');
			state = 'pending';
		} else if (arg === '--completed') {
			if (state === 'pending')
				throw new Error('Specify only one of --pending or --completed');
			state = 'completed';
		} else if (arg === '--summary') {
			summary = true;
		} else if (arg === '--type') {
			const rawTypes = splitList(requireOptionValue(base.rest, index, arg));
			for (const rawType of rawTypes) {
				if (!featureStatusTypes.includes(rawType as FeatureStatusType)) {
					throw new Error(`Invalid --type value: ${rawType}`);
				}
			}
			types = [...(types ?? []), ...(rawTypes as FeatureStatusType[])];
			index++;
		} else if (arg !== undefined) {
			rest.push(arg);
		}
	}
	if (rest.length > 0) throw new Error(`Unknown features:status option(s): ${rest.join(' ')}`);
	return {
		...base,
		...(state !== undefined ? { state } : {}),
		summary,
		...(types !== undefined ? { types } : {}),
		rest: [],
	};
}

function takeProjectDir(argv: string[]): ProjectOptions {
	let projectDir: string | undefined;
	const rest: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--project-dir') {
			const value = argv[index + 1];
			if (!value) throw new Error('--project-dir requires a value');
			projectDir = resolve(value);
			index++;
		} else if (arg !== undefined) {
			rest.push(arg);
		}
	}
	if (!projectDir) throw new Error('--project-dir is required');
	return { projectDir, rest };
}

function splitAuditName(argv: string[]): { auditName: string; rest: string[] } {
	let auditName: string | undefined;
	const rest: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--audit') {
			const value = argv[index + 1];
			if (!value) throw new Error('--audit requires a value');
			auditName = value;
			index++;
		} else if (arg !== undefined) {
			rest.push(arg);
		}
	}
	if (!auditName) throw new Error('--audit is required');
	return { auditName, rest };
}

export {
	requireOptionValue,
	splitAuditName,
	splitList,
	takeApplicationsOptions,
	takeFeatureStatusOptions,
	takeProjectDir,
};
export type { ApplicationsOptions, FeatureStatusCommandOptions, ProjectOptions, ToolCommand };
