import { readConfig, type ResolvedConfig } from 'aidd-shared/config';
import { metadataPath } from 'aidd-shared/metadata/paths';

export interface ResolveLaunchConfigInput {
	base: ResolvedConfig;
	/** null → no project overlay (director cycles, pre-scaffold project create). */
	projectDir: null | string;
}

export interface ResolvedLaunchConfig {
	config: ResolvedConfig;
	projectConfigApplied: boolean;
}

/**
 * The launch-time config for a target project: the server's live resolved config (kept
 * fresh by settings saves via updateConfig) overlaid with the project's
 * `.aidd/aidd.config.json` — the same layering a direct CLI invocation applies, so web
 * launches honor per-project config instead of trampling it with global defaults. Only
 * the launch-relevant fields are overlaid; server-scoped config (web.*, channels, …)
 * never moves per project. The project file is read fresh on every call so edits are
 * honored without a server restart.
 *
 * @param input Base resolved config plus the target project directory (null = no overlay).
 * @returns The overlaid config and whether a project config contributed to it.
 */
export async function resolveLaunchConfig(
	input: ResolveLaunchConfigInput
): Promise<ResolvedLaunchConfig> {
	const { base, projectDir } = input;
	if (!projectDir) return { config: base, projectConfigApplied: false };
	const project = await readConfig(metadataPath(projectDir, 'aidd.config.json'));
	if (Object.keys(project).length === 0) return { config: base, projectConfigApplied: false };

	// Merge semantics mirror shared applyConfig: scalars replace, backends/triumvirate
	// merge per key, providers replace wholesale.
	const config: ResolvedConfig = { ...base };
	if (project.cli !== undefined) config.cli = project.cli;
	if (project.model !== undefined) config.sharedModel = project.model;
	if (project.codeModel !== undefined) config.codeModel = project.codeModel;
	if (project.auditModel !== undefined) config.auditModel = project.auditModel;
	if (project.reasoningEffort !== undefined) config.reasoningEffort = project.reasoningEffort;
	if (project.defaultProvider !== undefined) config.defaultProvider = project.defaultProvider;
	if (project.backends !== undefined) config.backends = { ...base.backends, ...project.backends };
	if (project.providers !== undefined) config.providers = project.providers;
	if (project.triumvirate !== undefined) {
		config.triumvirate = { ...base.triumvirate, ...project.triumvirate };
	}
	// config.model is the pre-folded per-cli model (backends[cli].model ?? shared model);
	// recompute it against the overlaid cli/backends/model so downstream resolution sees
	// a consistent view.
	const model = config.backends?.[config.cli]?.model ?? config.sharedModel;
	if (model !== undefined) config.model = model;
	else delete config.model;
	return { config, projectConfigApplied: true };
}
