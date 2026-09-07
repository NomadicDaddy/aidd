import fs from 'node:fs';
import path from 'node:path';

import { APPLICATIONS_INDEX_CANDIDATES, APPLICATIONS_ROOT } from './constants.ts';
import { type DiscoveredApp } from './types.ts';

function resolveApplicationsIndexPath(): string {
	for (const name of APPLICATIONS_INDEX_CANDIDATES) {
		const candidate = path.join(APPLICATIONS_ROOT, name);
		if (fs.existsSync(candidate)) return candidate;
	}
	throw new Error(
		`No applications index found in ${APPLICATIONS_ROOT} (looked for ${APPLICATIONS_INDEX_CANDIDATES.join(', ')})`,
	);
}

function normalizeMarkdownLocation(location: string): string {
	return location.replace(/\\_/g, '_').replace(/\//g, path.sep);
}

export function discoverApps(filterApps: null | Set<string>): DiscoveredApp[] {
	const text = fs.readFileSync(resolveApplicationsIndexPath(), 'utf8');
	const discovered: DiscoveredApp[] = [];

	for (const line of text.split(/\r?\n/)) {
		if (!line.startsWith('|')) {
			continue;
		}

		const columns = line
			.split('|')
			.slice(1, -1)
			.map((value) => value.trim());

		if (columns.length < 2) {
			continue;
		}

		const [name, rawLocation] = columns;
		if (!name || name === 'application' || /^-+$/.test(name)) {
			continue;
		}
		if (!rawLocation || rawLocation === 'location' || !/^d:/i.test(rawLocation)) {
			continue;
		}

		const root = path.normalize(normalizeMarkdownLocation(rawLocation));
		if (root.includes('.old')) {
			continue;
		}

		const featuresDir = path.join(root, '.aidd', 'features');
		if (!fs.existsSync(featuresDir) || !fs.statSync(featuresDir).isDirectory()) {
			continue;
		}
		if (filterApps && !filterApps.has(name)) {
			continue;
		}

		discovered.push({ featuresDir, name, root });
	}

	return discovered;
}
