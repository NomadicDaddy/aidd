import { basename, join, resolve } from 'node:path';

import type { StackDeclaration } from './project-stack-declarations.ts';

import {
	declarationFor,
	isSpernakitFleetMember,
	readProjectStackDeclaration,
} from './project-stack-declarations.ts';
import { gatherProjectStackEvidence, readProjectPackage } from './project-stack-evidence.ts';
import { familyFromEvidence } from './project-stack-family.ts';

export { manifestEntryVersion } from './project-stack-declarations.ts';
export { projectPackageManifestPaths } from './project-stack-evidence.ts';

export type ProjectStackSource =
	'detected' | 'fleet-manifest' | 'package-declaration' | 'project-declaration' | 'unknown';

export interface ProjectStack {
	family: string;
	frameworks: string[];
	label: string;
	languages: string[];
	runtimes: string[];
	source: ProjectStackSource;
}

export interface DetectProjectStackOptions {
	containingRoot?: string;
	spernakitFleetManifest?: null | string;
}

function sorted(values: Set<string>): string[] {
	return [...values].sort((left, right) => left.localeCompare(right));
}

export async function detectProjectStack(
	projectDir: string,
	options: DetectProjectStackOptions = {}
): Promise<ProjectStack> {
	const rootPackage = await readProjectPackage(join(projectDir, 'package.json'));
	const evidencePromise = gatherProjectStackEvidence(projectDir);
	let declaration: null | StackDeclaration;
	let source: ProjectStackSource = 'unknown';
	if (typeof rootPackage?.stack === 'string' && rootPackage.stack.trim()) {
		declaration = declarationFor(rootPackage.stack);
		source = 'package-declaration';
	} else if (typeof rootPackage?.spernakit_version === 'string') {
		declaration = { family: 'spernakit', label: 'Spernakit' };
		source = 'package-declaration';
	} else {
		declaration = await readProjectStackDeclaration(projectDir, projectDir, true);
		if (declaration) source = 'project-declaration';
	}
	const containingRoot = options.containingRoot ? resolve(options.containingRoot) : null;
	if (!declaration && containingRoot && containingRoot !== resolve(projectDir)) {
		declaration = await readProjectStackDeclaration(containingRoot, projectDir, false);
		if (declaration) source = 'project-declaration';
	}
	if (
		!declaration &&
		options.spernakitFleetManifest &&
		(await isSpernakitFleetMember(options.spernakitFleetManifest, basename(projectDir)))
	) {
		declaration = { family: 'spernakit', label: 'Spernakit' };
		source = 'fleet-manifest';
	}
	const evidence = await evidencePromise;
	if (!declaration) {
		declaration = familyFromEvidence(evidence);
		source = declaration.family === 'unknown' ? 'unknown' : 'detected';
	}
	return {
		...declaration,
		frameworks: sorted(evidence.frameworks),
		languages: sorted(evidence.languages),
		runtimes: sorted(evidence.runtimes),
		source,
	};
}
