import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuditSetupEvidence } from './audit-dependencies-evidence.ts';

/** Bun has no --production=false flag, and --dev does not override install.production.
 * Keep project settings, override only production, and keep relative config paths rooted beside
 * the original. This owned temporary file is removed before the audit agent starts. */
export async function createAuditInstallConfig(evidence: AuditSetupEvidence): Promise<string> {
	const source = join(evidence.cwd, 'bunfig.toml');
	const config: Record<string, unknown> = existsSync(source)
		? (Bun.TOML.parse(readFileSync(source, 'utf8')) as Record<string, unknown>)
		: {};
	const install = config.install;
	if (
		install !== undefined &&
		(typeof install !== 'object' || install === null || Array.isArray(install))
	) {
		throw new Error('Unsupported Bun install configuration for audit setup.');
	}
	const target = join(evidence.cwd, '.aidd-audit-install.bunfig.toml');
	await writeFile(
		target,
		Bun.TOML.stringify({
			...config,
			install: { ...(install as Record<string, unknown> | undefined), production: false },
		}),
		{ flag: 'wx' },
	);
	evidence.command.push(`--config=${target}`);
	return target;
}
