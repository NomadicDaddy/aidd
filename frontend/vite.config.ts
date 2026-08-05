import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

type PackageJson = {
	repository?: { url?: unknown } | string;
	version?: unknown;
};

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

// `git+https://….git` is the package-manager form; About links a human at it, so normalise to the
// browsable URL rather than shipping a clone address into the page.
const rawRepository =
	typeof packageJson.repository === 'string'
		? packageJson.repository
		: typeof packageJson.repository?.url === 'string'
			? packageJson.repository.url
			: '';
const repositoryUrl = rawRepository.replace(/^git\+/, '').replace(/\.git$/, '');

export default defineConfig({
	define: {
		__AIDD_REPOSITORY_URL__: JSON.stringify(repositoryUrl),
		__AIDD_VERSION__: JSON.stringify(appVersion),
	},
	plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
	root: frontendRoot,
});
