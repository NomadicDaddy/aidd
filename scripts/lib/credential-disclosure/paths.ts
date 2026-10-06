/** A store's full file name: what follows must end the word, so `.example` and `.schema` do not. */
function store(path: string): RegExp {
	return new RegExp(path + String.raw`(?=$|[\s"'\`)>|;&])`, 'i');
}

/** Credential stores, excluding project configuration and committed dotenv templates. */
export const CREDENTIAL_PATHS: { label: string; pattern: RegExp }[] = [
	{ label: 'aidd user config', pattern: /\.aidd[/\\]+config\.json/i },
	{ label: 'ssh private key material', pattern: /\.ssh[/\\]+id_[a-z0-9]+/i },
	{ label: 'aws credentials', pattern: /\.aws[/\\]+credentials/i },
	{ label: 'netrc', pattern: /[/\\]\.netrc\b/i },
	{ label: 'npmrc', pattern: /[/\\]\.npmrc\b/i },
	// Stores an external CLI backend can read from the home directory. Each is anchored on its dot
	// directory and ends at the exact file name, so a project's own docker/config.json, a checked-in
	// .docker/config.json.example or a .kube/config.example.yaml is not one.
	{ label: 'git credential store', pattern: store(String.raw`[/\\]\.git-credentials`) },
	{ label: 'github cli token', pattern: store(String.raw`[/\\]gh[/\\]+hosts\.ya?ml`) },
	{ label: 'codex auth', pattern: store(String.raw`\.codex[/\\]+auth\.json`) },
	{
		label: 'claude code credentials',
		pattern: store(String.raw`\.claude[/\\]+\.credentials\.json`),
	},
	{ label: 'opencode auth', pattern: store(String.raw`[/\\]opencode[/\\]+auth\.json`) },
	{ label: 'docker client config', pattern: store(String.raw`\.docker[/\\]+config\.json`) },
	{ label: 'pgpass', pattern: store(String.raw`[/\\]\.pgpass`) },
	{ label: 'kube config', pattern: store(String.raw`\.kube[/\\]+config`) },
	{ label: 'azure token cache', pattern: store(String.raw`\.azure[/\\]+accessTokens\.json`) },
	{
		label: 'gcloud application default credentials',
		pattern: store(String.raw`gcloud[/\\]+application_default_credentials\.json`),
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
