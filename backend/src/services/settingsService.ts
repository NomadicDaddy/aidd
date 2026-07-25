import { type PartialAiddConfig, readConfig, resolveMergedConfig } from 'aidd-shared/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { WebConfigSettingsDto } from '../types.ts';
import type {
	SettingsUpdateResult,
	WebConfigSettingsInput,
	WebRuntimeConfig,
} from './settings/types.ts';

import { recordDataMovement } from './dataMovementTrace.ts';
import { buildUpdatedConfig } from './settings/configUpdate.ts';
import { buildSettingsDto } from './settings/dtoShaping.ts';

export type {
	SettingsUpdateResult,
	WebConfigSettingsInput,
	WebRuntimeConfig,
} from './settings/types.ts';

export class SettingsService {
	private config: WebRuntimeConfig;
	private readonly configPath: string;

	constructor(config: WebRuntimeConfig, configPath: string) {
		this.config = config;
		this.configPath = configPath;
	}

	getCurrentResolvedConfig(): WebRuntimeConfig {
		return this.config;
	}

	private getConfigBaseDir(): string {
		return resolve(this.config.web.dataDir, '..');
	}

	async getConfig(): Promise<WebConfigSettingsDto> {
		return this.toDto(await readConfig(this.configPath));
	}

	async updateConfig(input: WebConfigSettingsInput): Promise<SettingsUpdateResult> {
		const existing = await readConfig(this.configPath);
		const next = buildUpdatedConfig(input, existing, this.config);
		// Create the parent dir with 0700 (owner-only): it holds config.json with plaintext
		// provider API keys, web.authToken, and the Telegram botToken. Without an explicit
		// mode the directory lands at the umask default (~0755), leaving it world-traversable
		// and world-listable on POSIX (mode is ignored on Windows). Mirrors the 0600 file mode.
		await mkdir(dirname(this.configPath), { mode: 0o700, recursive: true });
		// Write with 0600 (owner-read-write only): the config file holds plaintext provider
		// API keys, web.authToken, and the Telegram botToken. Without an explicit mode the
		// file lands at the process umask default (~0644), leaking secrets to group/other.
		await writeFile(this.configPath, `${JSON.stringify(next, null, '\t')}\n`, {
			mode: 0o600,
		});
		recordDataMovement({
			category: 'metadata',
			operation: 'settings.config.write',
			status: 'success',
			summary: {
				applicationRoots: input.applicationRoots.length,
				ignoredFolders: input.ignoredFolders.length,
			},
			target: this.configPath,
		});
		const resolved = resolveMergedConfig(next, {
			applicationsRoot: next.applicationsRoot,
			baseDir: this.getConfigBaseDir(),
		});
		this.config = {
			...resolved,
			web: {
				...resolved.web!,
				allowedOrigins: this.config.web.allowedOrigins,
				allowRemote: this.config.web.allowRemote,
				dataDir: this.config.web.dataDir,
				hostname: this.config.web.hostname,
				port: this.config.web.port,
			},
		};
		this.config.web.spernakitInitScript = resolved.web?.spernakitInitScript ?? null;
		return {
			config: this.toDto(next),
			resolvedConfig: this.config,
		};
	}

	private toDto(config: PartialAiddConfig): WebConfigSettingsDto {
		return buildSettingsDto(config, {
			configBaseDir: this.getConfigBaseDir(),
			configPath: this.configPath,
			current: this.config,
		});
	}
}
