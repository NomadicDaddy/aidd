import { describe, expect, test } from 'bun:test';

import { commandCredentialLabel } from '../../scripts/lib/credential-disclosure/command.ts';
import { credentialLabel } from '../../scripts/lib/credential-disclosure/paths.ts';

const returned = 'fixture contents that stand in for a credential and are not one';

// Stores an external CLI backend can read from the home directory. The list held six; a transcript
// that read the Codex or Claude Code credential file, the GitHub CLI token or the git credential
// store passed the gate because none of them was named.
const stores: [string, string][] = [
	['~/.git-credentials', 'git credential store'],
	['~/.config/gh/hosts.yml', 'github cli token'],
	['~/.codex/auth.json', 'codex auth'],
	['~/.claude/.credentials.json', 'claude code credentials'],
	['~/.config/opencode/auth.json', 'opencode auth'],
	['~/.docker/config.json', 'docker client config'],
	['~/.pgpass', 'pgpass'],
	['~/.kube/config', 'kube config'],
	['~/.azure/accessTokens.json', 'azure token cache'],
	[
		'~/.config/gcloud/application_default_credentials.json',
		'gcloud application default credentials',
	],
	['D:/secrets/service.key', 'secrets directory'],
	['/d/secrets/service.key', 'secrets directory'],
	['/mnt/d/secrets/service.key', 'secrets directory'],
];

describe('credential stores an external backend can reach', () => {
	test('each store is labelled in both slash directions', () => {
		for (const [path, label] of stores) {
			expect(credentialLabel(path)).toBe(label);
			// A POSIX drive spelling (/d/, /mnt/d/) only ever appears with forward slashes.
			if (!path.startsWith('/')) {
				expect(credentialLabel(path.replaceAll('/', '\\'))).toBe(label);
			}
		}
	});

	test('reading a store with content returned is a disclosure; listing or testing it is not', () => {
		for (const [path, label] of stores) {
			expect(commandCredentialLabel(`cat ${path}`, returned)).toBe(label);
			expect(commandCredentialLabel(`ls ${path}`, returned)).toBeUndefined();
			expect(commandCredentialLabel(`test -f ${path}`, returned)).toBeUndefined();
		}
	});

	test('project files with similar names are not stores', () => {
		for (const path of [
			'docker/config.json',
			'deploy/docker/config.json',
			'docs/secrets.md',
			'src/secrets/index.ts',
			'scripts/codex/auth.ts',
			'k8s/kube/config.example.yaml',
			// Checked-in examples and schemas beside a store's name (Roger's review of b8f5bf2a).
			'~/.kube/config.example.yaml',
			'~/.docker/config.json.example',
			'~/.codex/auth.json.schema',
			'~/.config/gh/hosts.yml.example',
			'~/.pgpass.example',
		]) {
			expect(credentialLabel(path)).toBeUndefined();
		}
	});
});
