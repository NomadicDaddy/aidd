/** Credential stores, excluding project configuration and committed dotenv templates. */
export const CREDENTIAL_PATHS: { label: string; pattern: RegExp }[] = [
	{ label: 'aidd user config', pattern: /\.aidd[/\\]+config\.json/i },
	{ label: 'ssh private key material', pattern: /\.ssh[/\\]+id_[a-z0-9]+/i },
	{ label: 'aws credentials', pattern: /\.aws[/\\]+credentials/i },
	{ label: 'netrc', pattern: /[/\\]\.netrc\b/i },
	{ label: 'npmrc', pattern: /[/\\]\.npmrc\b/i },
	{
		label: 'dotenv',
		pattern:
			/(?:^|[/\\:\s])\.env(?:\.(?!(?:dist|example|sample|template)\b)[a-z]+)?(?:$|[)"'\s])/i,
	},
];

export function credentialLabel(value: string): string | undefined {
	return CREDENTIAL_PATHS.find(({ pattern }) => pattern.test(value))?.label;
}
