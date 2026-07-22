import type { SkillDefinition } from 'aidd-shared/skills/catalog';

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { copyFileWithRetry, copyTreeIfChanged } from './scaffoldCommon.ts';
import { pathExists } from './scaffoldFs.ts';

// Contracts a skill run reads at runtime, resolved from the invoked skill's frontmatter (plus the
// invoked skill's own directory when it carries support files). Staged into the project `.aidd/`
// so a sandboxed agent can read them locally instead of reaching outside the project for
// `<aidd-root>/skills/...`, `<aidd-root>/audits/...`, or the skill's own sidecar files.
export interface SkillContractDeps {
	/** Skill ids whose whole directory is staged `skills/<id>/` -> `.aidd/skills/<id>/` (declared contracts + the invoked skill itself when it has support files). */
	contracts: string[];
	/** aidd-root-relative files: `<rootDir>/<ref>` -> `.aidd/<ref>`. */
	references: string[];
	/** Spernakit-root-relative files: `<spernakitRoot>/<ref>` -> `.aidd/<ref>` (staged only when a spernakit root is configured). */
	spernakitReferences: string[];
}

// Collect the dependencies to stage for an invoked skill: its declared contracts/references plus
// its own directory when it ships support files (sidecars, templates, source docs) that the
// compiled directive points at under `.aidd/skills/<id>/`. Returns undefined when there is nothing
// to stage so scaffolding can skip the pass entirely.
export function skillContractDeps(skill: SkillDefinition): SkillContractDeps | undefined {
	const contracts = [...(skill.contracts ?? [])];
	// The invoked skill's own sidecar files live in its skill directory, which is outside a foreign
	// sandbox. Stage that directory too (deduped) so the directive's `.aidd/skills/<id>/` support
	// paths resolve locally.
	if (skill.supportPaths.length > 0 && !contracts.includes(skill.id)) contracts.push(skill.id);
	if (!contracts.length && !skill.references?.length && !skill.spernakitReferences?.length) {
		return undefined;
	}
	return {
		contracts,
		references: skill.references ?? [],
		spernakitReferences: skill.spernakitReferences ?? [],
	};
}

// Stage the invoked skill's contract dependencies into the project `.aidd/`. A skill run is
// sandboxed to its project directory, so a body reference like `<aidd-root>/skills/humanize-docs/
// SKILL.md` (outside the project) is unreadable; copying the referenced skills and files into
// `.aidd/skills/` and `.aidd/<ref>` gives the agent a local, in-sandbox copy. Targets are always
// under `.aidd/`, which is inside the write-allowlist for metadata-only runs, so no allowsTarget
// gate is needed here (mirrors copyCommonModules/copyAuditFiles). A declared source that cannot be
// found is warned about (not silently skipped) since the skill prose tells the agent it was staged.
export async function copySkillContracts(
	deps: SkillContractDeps | undefined,
	rootDir: string,
	aiddDir: string,
	spernakitRoot: string | undefined,
	dataDir: string | undefined
): Promise<void> {
	if (!deps) return;
	for (const id of deps.contracts) {
		const source = await resolveSkillDir(rootDir, dataDir, id);
		if (!source) {
			console.warn(
				`Warning: skill contract '${id}' not found; not staged into .aidd/skills/`
			);
			continue;
		}
		const target = join(aiddDir, 'skills', id);
		await mkdir(target, { recursive: true });
		await copyTreeIfChanged(source, target);
	}
	await copyReferenceFiles('aidd', rootDir, aiddDir, deps.references);
	// Spernakit-root refs (e.g. docs/template/STACK.md) only stage when a spernakit root is
	// configured; a project's spernakit init script is the marker (its parent dir is the root).
	// Without a configured root there is nothing to copy and the skill's `<spernakit-root>`
	// fallback applies, so the missing-source warning is suppressed in that case.
	if (spernakitRoot) {
		await copyReferenceFiles('spernakit', spernakitRoot, aiddDir, deps.spernakitReferences);
	}
}

// A contract skill id may resolve to a bundled skill (`<rootDir>/skills/<id>`) or an imported one
// (`<dataDir>/skills/<id>`); check both so imported skills stage correctly.
async function resolveSkillDir(
	rootDir: string,
	dataDir: string | undefined,
	id: string
): Promise<string | undefined> {
	const bundled = join(rootDir, 'skills', id);
	if (await pathExists(bundled)) return bundled;
	if (dataDir) {
		const imported = join(dataDir, 'skills', id);
		if (await pathExists(imported)) return imported;
	}
	return undefined;
}

async function copyReferenceFiles(
	kind: 'aidd' | 'spernakit',
	sourceRoot: string,
	aiddDir: string,
	references: string[]
): Promise<void> {
	for (const ref of references) {
		const source = join(sourceRoot, ref);
		if (!(await pathExists(source))) {
			console.warn(
				`Warning: skill ${kind}-reference '${ref}' not found; not staged into .aidd/`
			);
			continue;
		}
		const target = join(aiddDir, ref);
		await mkdir(dirname(target), { recursive: true });
		await copyFileWithRetry(source, target);
	}
}
