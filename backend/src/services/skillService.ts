import {
	listSkillDefinitions,
	readSkillDefinition,
	type SkillCategory,
	type SkillDefinition,
} from 'aidd-shared/skills/catalog';
import { join } from 'node:path';

import { HttpError } from './errors.ts';
import {
	deleteImportedSkill,
	importSkill,
	previewSkillImport,
	type SkillImportPreview,
} from './skillImports.ts';

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 'ENOENT'
	);
}

// Catalog access only. One-shot skill runs launch through PipelineService
// with the synthetic `skill:<id>` recipe so the pipeline executor stays
// the single execution path.
export class SkillService {
	private readonly allowedRoots: string[];
	private readonly dataDir: string;
	private readonly rootDir: string;

	constructor(input: { allowedRoots?: string[]; dataDir?: string; rootDir: string }) {
		this.allowedRoots = input.allowedRoots ?? [input.rootDir];
		this.dataDir = input.dataDir ?? join(input.rootDir, 'data');
		this.rootDir = input.rootDir;
	}

	async deleteImportedSkill(id: string, references: string[]): Promise<void> {
		if (references.length > 0) {
			throw new HttpError(
				`Skill ${id} is still referenced by: ${references.join(', ')}`,
				409
			);
		}
		await deleteImportedSkill(this.dataDir, id);
	}

	async importSkill(input: {
		category?: SkillCategory;
		replace?: boolean;
		sourcePath: string;
	}): Promise<SkillDefinition> {
		const imported = await importSkill({
			allowedRoots: this.allowedRoots,
			...(input.category ? { category: input.category } : {}),
			dataDir: this.dataDir,
			...(input.replace === true ? { replace: true } : {}),
			rootDir: this.rootDir,
			sourcePath: input.sourcePath,
		});
		return await this.readSkill(imported.id);
	}

	async listSkills(): Promise<SkillDefinition[]> {
		return await listSkillDefinitions(this.rootDir, this.dataDir);
	}

	async previewImport(input: {
		category?: SkillCategory;
		sourcePath: string;
	}): Promise<SkillImportPreview> {
		return await previewSkillImport({
			allowedRoots: this.allowedRoots,
			...(input.category ? { category: input.category } : {}),
			dataDir: this.dataDir,
			rootDir: this.rootDir,
			sourcePath: input.sourcePath,
		});
	}

	async readSkill(id: string): Promise<SkillDefinition> {
		try {
			return await readSkillDefinition(this.rootDir, id, this.dataDir);
		} catch (err) {
			if (err instanceof Error && err.message.startsWith('Invalid skill id:')) {
				throw new HttpError(err.message, 400);
			}
			if (isMissingFileError(err)) throw new HttpError(`Skill not found: ${id}`, 404);
			throw err;
		}
	}
}
