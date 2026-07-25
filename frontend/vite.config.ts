import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

type PackageJson = {
	version?: unknown;
};

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

export default defineConfig({
	define: {
		__AIDD_VERSION__: JSON.stringify(appVersion),
	},
	plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
	root: frontendRoot,
});
