import type { StackEvidence } from './project-stack-evidence.ts';

import { declarationFor, type StackDeclaration } from './project-stack-declarations.ts';

export function familyFromEvidence(evidence: StackEvidence): StackDeclaration {
	const hasFramework = (name: string) => evidence.frameworks.has(name);
	const hasLanguage = (name: string) => evidence.languages.has(name);
	const hasRuntime = (name: string) => evidence.runtimes.has(name);
	if (hasLanguage('PowerShell') && hasFramework('Pode')) {
		return { family: 'powershell-pode', label: 'PowerShell/Pode' };
	}
	if (hasFramework('React') && hasFramework('Convex')) {
		return { family: 'react-convex', label: 'React/Convex' };
	}
	if (hasFramework('Next.js')) return { family: 'nextjs', label: 'Next.js' };
	if (hasFramework('React') && hasFramework('Vite')) {
		return { family: 'react-vite', label: 'React/Vite' };
	}
	if (hasFramework('Vue') && hasFramework('Vite')) {
		return { family: 'vue-vite', label: 'Vue/Vite' };
	}
	if (hasFramework('SvelteKit')) return { family: 'sveltekit', label: 'SvelteKit' };
	if (hasFramework('Svelte')) return { family: 'svelte', label: 'Svelte' };
	for (const framework of [
		'Angular',
		'Astro',
		'Elysia',
		'NestJS',
		'Fastify',
		'Express',
		'Hono',
	]) {
		if (hasFramework(framework)) return declarationFor(framework);
	}
	for (const language of [
		'PowerShell',
		'Python',
		'Go',
		'Rust',
		'.NET',
		'Java',
		'PHP',
		'Ruby',
		'Shell',
	]) {
		if (hasLanguage(language)) return declarationFor(language);
	}
	if (hasLanguage('TypeScript')) {
		if (hasRuntime('Bun')) return { family: 'typescript-bun', label: 'TypeScript/Bun' };
		if (hasRuntime('Deno')) return { family: 'typescript-deno', label: 'TypeScript/Deno' };
		if (hasRuntime('Node.js'))
			return { family: 'typescript-node', label: 'TypeScript/Node.js' };
		return { family: 'typescript', label: 'TypeScript' };
	}
	if (hasLanguage('JavaScript')) {
		if (hasRuntime('Bun')) return { family: 'javascript-bun', label: 'JavaScript/Bun' };
		if (hasRuntime('Deno')) return { family: 'javascript-deno', label: 'JavaScript/Deno' };
		if (hasRuntime('Node.js'))
			return { family: 'javascript-node', label: 'JavaScript/Node.js' };
		return { family: 'javascript', label: 'JavaScript' };
	}
	return { family: 'unknown', label: 'Unknown' };
}
