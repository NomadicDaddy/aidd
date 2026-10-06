/** Credential stores, excluding project configuration and committed dotenv templates. */
export const CREDENTIAL_PATHS: { label: string; pattern: RegExp }[] = [
	{ label: 'aidd user config', pattern: /\.aidd[/\\]+config\.json/i },
	{ label: 'ssh private key material', pattern: /\.ssh[/\\]+id_[a-z0-9]+/i },
	{ label: 'aws credentials', pattern: /\.aws[/\\]+credentials/i },
	{ label: 'netrc', pattern: /[/\\]\.netrc\b/i },
	{ label: 'npmrc', pattern: /[/\\]\.npmrc\b/i },
	// Stores an external CLI backend can read from the home directory. Each is anchored on its dot
	// directory or exact file name, so a project's own docker/config.json or docs/secrets.md is not one.
	{ label: 'git credential store', pattern: /[/\\]\.git-credentials\b/i },
	{ label: 'github cli token', pattern: /[/\\]gh[/\\]+hosts\.ya?ml\b/i },
	{ label: 'codex auth', pattern: /\.codex[/\\]+auth\.json/i },
	{ label: 'claude code credentials', pattern: /\.claude[/\\]+\.credentials\.json/i },
	{ label: 'opencode auth', pattern: /[/\\]opencode[/\\]+auth\.json/i },
	{ label: 'docker client config', pattern: /\.docker[/\\]+config\.json/i },
	{ label: 'pgpass', pattern: /[/\\]\.pgpass\b/i },
	{ label: 'kube config', pattern: /\.kube[/\\]+config\b/i },
	{ label: 'azure token cache', pattern: /\.azure[/\\]+accessTokens\.json/i },
	{
		label: 'gcloud application default credentials',
		pattern: /gcloud[/\\]+application_default_credentials\.json/i,
	},
	// The approved directory for regenerable secret material: D:\secrets, /d/secrets, /mnt/d/secrets.
	{
		label: 'secrets directory',
		pattern: /(?:^|[\s"'=(:])(?:[a-z]:|\/[a-z]|\/mnt\/[a-z])[/\\]+secrets[/\\]/i,
	},
	{
		label: 'dotenv',
		pattern:
			/(?:^|[/\\:\s])\.env(?:\.(?!(?:dist|example|sample|template)\b)[a-z]+)?(?:$|[)"'\s])/i,
	},
];

export function credentialLabel(value: string): string | undefined {
	return CREDENTIAL_PATHS.find(({ pattern }) => pattern.test(value))?.label;
}
