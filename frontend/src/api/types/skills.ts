export type BackendName =
	| 'claude-code'
	| 'codex'
	| 'grok'
	| 'kilocode'
	| 'lmstudio'
	| 'native'
	| 'ollama'
	| 'openai'
	| 'opencode';
export type BackendInputName = BackendName;

export type SkillCategory =
	| 'audit-remediation'
	| 'general'
	| 'metadata'
	| 'recipe-maturity'
	| 'runtime'
	| 'spernakit-fleet';

export type SkillOrigin = 'bundled' | 'imported';

export interface ImportedSkillRecord {
	category: SkillCategory;
	importedAt: string;
	sourcePath: string;
	sourceSha256: string;
}

export interface SkillDefinition {
	allowedTools?: string;
	body: string;
	category: SkillCategory;
	compatibility?: string;
	description: string;
	extensions: Record<string, unknown>;
	id: string;
	imported?: ImportedSkillRecord;
	license?: string;
	metadata: Record<string, string>;
	origin: SkillOrigin;
	sourcePath: string;
	supportPaths: string[];
	title: string;
	usage: string;
}

export interface SkillImportPreview {
	category: SkillCategory;
	conflict: 'bundled' | 'imported' | 'none';
	description: string;
	fileCount: number;
	id: string;
	sourcePath: string;
	sourceSha256: string;
	title: string;
	totalBytes: number;
}
