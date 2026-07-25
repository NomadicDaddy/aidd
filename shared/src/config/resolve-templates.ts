import type { PartialAiddConfig } from './schema.ts';
import type { ResolvedProjectTemplateConfig } from './types.ts';

// Sentinel initCommand of the synthesized spernakit entry. create.ts routes the synthesized entry
// (and bare 'spernakit' mode) to the clone-then-init generator; an explicit web.templates[spernakit]
// override carries a different initCommand and is run through the generic engine instead.
const SYNTHESIZED_SPERNAKIT_INIT_COMMAND = ['bun', 'scripts/init.ts'];

// True when a resolved spernakit template is the built-in synthesized one (not a user override).
export function isSynthesizedSpernakitTemplate(template: ResolvedProjectTemplateConfig): boolean {
	return (
		template.name === 'spernakit' &&
		template.initCommand.length === SYNTHESIZED_SPERNAKIT_INIT_COMMAND.length &&
		template.initCommand.every((token, i) => token === SYNTHESIZED_SPERNAKIT_INIT_COMMAND[i])
	);
}

// Spernakit is always offered as the golden-path template. Its scaffolding is owned by create.ts,
// which runs the portable generator (scripts/init.ts) from a configured checkout or an on-demand
// clone — so the synthesized entry here is listing metadata only and its initCommand is never
// executed. Explicit web.templates entries are normalized; any entry named 'spernakit' overrides the
// synthesized one. Third-party templates default to postCreate 'ingest' (a scaffold with no .aidd
// contract or known gates); the synthesized spernakit entry keeps its coding-run golden path.
export function resolveProjectTemplates(
	configured: NonNullable<PartialAiddConfig['web']>['templates'],
): ResolvedProjectTemplateConfig[] {
	const explicit: ResolvedProjectTemplateConfig[] = (configured ?? []).map((template) => ({
		cwd: template.cwd ?? 'root',
		description: template.description ?? template.name,
		initCommand: [...template.initCommand],
		name: template.name,
		postCreate: template.postCreate ?? 'ingest',
		requiresDescription: template.requiresDescription ?? false,
		rootMustBeInitDir: template.rootMustBeInitDir ?? false,
		validationCommand: template.validationCommand ?? null,
	}));
	const hasExplicitSpernakit = explicit.some((template) => template.name === 'spernakit');
	if (!hasExplicitSpernakit) {
		explicit.unshift({
			cwd: 'root',
			description:
				'Full Spernakit application (Bun + Elysia + React + Drizzle). Clones the template if no local checkout is configured.',
			// Never executed — create.ts intercepts the synthesized 'spernakit' template and runs
			// scripts/init.ts. This exact command is the synthesized-vs-explicit sentinel.
			initCommand: [...SYNTHESIZED_SPERNAKIT_INIT_COMMAND],
			name: 'spernakit',
			postCreate: 'coding-run',
			requiresDescription: true,
			rootMustBeInitDir: false,
			validationCommand: 'bun run smoke:qc',
		});
	}
	return explicit;
}
