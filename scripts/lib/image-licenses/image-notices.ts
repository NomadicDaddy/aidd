/**
 * The two things about a built image that can only be learned by opening it: whether the required
 * notices arrived, and whether the agent CLIs stayed out.
 *
 * Extracted from scripts/check-image-licenses.ts (max-lines split). Nothing here exits the process;
 * each verification prints its own report and returns whether it passed, so the gate keeps sole
 * ownership of the exit code.
 */
import { runInImage } from './image-inventory.ts';

export const REQUIRED_IN_IMAGE = [
	'/app/LICENSE',
	'/app/THIRD-PARTY-LICENSES.md',
	'/app/THIRD-PARTY-NOTICES.md',
	'/app/licenses/BUN-LICENSE.md',
	'/app/licenses/LGPL-2.0.txt',
	'/app/licenses/LGPL-2.1.txt',
	'/app/licenses/SOURCE-OFFER.md',
	'/app/licenses/base-image-packages.md',
	'/app/licenses/distributed-materials.json',
	// Debian ships the GPL/LGPL texts its own packages reference; they must survive a slimming pass.
	'/usr/share/common-licenses/GPL-2',
	'/usr/share/common-licenses/GPL-3',
	'/usr/share/common-licenses/LGPL-2.1',
];

/**
 * Baking any of these back into the image would redistribute them. See 2.116.0.
 *
 * These are BINARY names, not package names — the guard runs `command -v`. @kilocode/cli installs
 * `kilo`, so listing it as `kilocode` looked for something that never exists and would have waved
 * a re-baked Kilo Code CLI straight through the one check meant to catch it.
 */
export const FORBIDDEN_IN_IMAGE = ['claude', 'cline', 'codex', 'opencode', 'kilo'];

export async function verifyNoticesPresent(image: string, updating: boolean): Promise<boolean> {
	// The inventory is the file --update is about to generate, so it cannot be inside the image on
	// the run that creates it. Generate, rebuild, then check.
	const required = updating
		? REQUIRED_IN_IMAGE.filter((path) => !path.endsWith('base-image-packages.md'))
		: REQUIRED_IN_IMAGE;
	const output = await runInImage(
		image,
		required.map((path) => `[ -e ${path} ] || echo MISSING ${path}`).join('; '),
	);
	const missing = output
		.split('\n')
		.filter((line) => line.startsWith('MISSING'))
		.map((line) => line.replace('MISSING ', '').trim());

	if (missing.length > 0) {
		console.error(`[FAIL] ${image} is missing license material:`);
		for (const path of missing) console.error(`  - ${path}`);
		console.error('');
		console.error('The image ships an LGPL-linked binary on a GPL/LGPL Debian base. Check the');
		console.error('Dockerfile COPY lines and that .dockerignore keeps the notices in context.');
		return false;
	}
	console.log(`[OK] ${image}: license material present (${required.length} paths).`);
	return true;
}

export async function verifyAgentClisAbsent(image: string): Promise<boolean> {
	const output = await runInImage(
		image,
		FORBIDDEN_IN_IMAGE.map(
			(binary) => `command -v ${binary} >/dev/null 2>&1 && echo FOUND ${binary}`,
		)
			.join('; ')
			.concat('; true'),
	);
	const found = output
		.split('\n')
		.filter((line) => line.startsWith('FOUND'))
		.map((line) => line.replace('FOUND ', '').trim());

	if (found.length > 0) {
		console.error(`[FAIL] ${image} contains agent CLIs that must not be redistributed:`);
		for (const binary of found) console.error(`  - ${binary}`);
		console.error('');
		console.error('Baking these in makes every published image a redistribution of them, and');
		console.error('@anthropic-ai/claude-code carries no redistribution grant (SEE LICENSE IN');
		console.error(
			'README.md -> Anthropic commercial terms). The entrypoint installs them into',
		);
		console.error('the home volume at run time instead; keep them out of the image.');
		return false;
	}
	console.log(`[OK] ${image}: no agent CLIs baked in (${FORBIDDEN_IN_IMAGE.length} checked).`);
	return true;
}
