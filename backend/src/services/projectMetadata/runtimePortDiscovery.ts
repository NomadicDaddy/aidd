import type { ProjectStack } from 'aidd-shared/metadata/project-stack';

import { projectPackageManifestPaths } from 'aidd-shared/metadata/project-stack';
import { readProjectPackage } from 'aidd-shared/metadata/project-stack-evidence';
import { dirname, join } from 'node:path';

import type { ProjectPorts } from '../../types.ts';

import { readTextOrNull } from '../fsHelpers.ts';

const ENVIRONMENT_FILES = ['.env', '.env.development', '.env.local'] as const;
const FRONTEND_COMMAND = /\b(?:astro|next|ng\s+serve|react-scripts|svelte-kit|vite)\b/i;
const BACKEND_COMMAND = /\b(?:deno|nest|node|tsx)\b/i;
const FRONTEND_SCRIPT = /(?:^|:)(?:client|frontend|web)(?:$|:)/i;
const BACKEND_SCRIPT = /(?:^|:)(?:api|backend|server)(?:$|:)/i;
const PORT_ARGUMENT = /(?:--port(?:=|\s+)|(?:^|\s)-p\s+)(\d+)(?=\s|$)/;
const BUN_EXECUTABLE = /(?:^|[\\/])bun(?:\.exe)?$/i;
const BUN_DIRECT_ENTRY = /(?:^|[\\/])[^\\/]+\.(?:cjs|js|jsx|mjs|ts|tsx)$/i;
const BUN_TARGET_OPTIONS = new Set(['--cwd', '--filter']);

type PortRole = 'backend' | 'frontend';

interface PackageJson {
	scripts?: Record<string, unknown>;
}

export function isTcpPort(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function portFromText(value: string): null | number {
	const parsed = Number(value);
	return isTcpPort(parsed) ? parsed : null;
}

function commandPort(command: string): null | number {
	const match = command.match(PORT_ARGUMENT);
	return match?.[1] ? portFromText(match[1]) : null;
}

function isFrontendStack(stack: ProjectStack): boolean {
	return stack.frameworks.some((framework) =>
		['Angular', 'Astro', 'Next.js', 'React', 'Svelte', 'SvelteKit', 'Vite', 'Vue'].includes(
			framework,
		),
	);
}

function isBackendStack(stack: ProjectStack): boolean {
	return stack.frameworks.some((framework) =>
		['Elysia', 'Express', 'Fastify', 'Hono', 'NestJS', 'Pode'].includes(framework),
	);
}

function genericPortRole(stack: ProjectStack): null | PortRole {
	const frontend = isFrontendStack(stack);
	const backend = isBackendStack(stack);
	if (frontend === backend) return null;
	return frontend ? 'frontend' : 'backend';
}

function commandTokens(command: string): string[] {
	return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) =>
		token.replace(/^(?:"|')|(?:"|')$/g, ''),
	);
}

function targetPortRole(target: string): null | PortRole {
	const segments = target.split(/[\\/:]/).filter(Boolean);
	if (segments.some((segment) => ['client', 'frontend', 'web'].includes(segment.toLowerCase()))) {
		return 'frontend';
	}
	if (segments.some((segment) => ['api', 'backend', 'server'].includes(segment.toLowerCase()))) {
		return 'backend';
	}
	return null;
}

function bunPortRole(command: string, stack: ProjectStack): null | PortRole | undefined {
	const tokens = commandTokens(command);
	const bunIndex = tokens.findIndex((token) => BUN_EXECUTABLE.test(token));
	if (bunIndex === -1) return undefined;

	const roles = new Set<PortRole>();
	let commandIndex = -1;
	for (let index = bunIndex + 1; index < tokens.length; index++) {
		const token = tokens[index] ?? '';
		if (BUN_TARGET_OPTIONS.has(token)) {
			const role = targetPortRole(tokens[index + 1] ?? '');
			if (role) roles.add(role);
			index++;
			continue;
		}
		const optionTarget = token.match(/^--(?:cwd|filter)=(.+)$/)?.[1];
		if (optionTarget) {
			const role = targetPortRole(optionTarget);
			if (role) roles.add(role);
			continue;
		}
		if (token.startsWith('-')) continue;
		commandIndex = index;
		break;
	}

	const commandName = tokens[commandIndex];
	if (commandName && BUN_DIRECT_ENTRY.test(commandName)) return 'backend';
	if (commandName === 'run') {
		for (let index = commandIndex + 1; index < tokens.length; index++) {
			const token = tokens[index] ?? '';
			if (BUN_TARGET_OPTIONS.has(token)) {
				const role = targetPortRole(tokens[index + 1] ?? '');
				if (role) roles.add(role);
				index++;
				continue;
			}
			const optionTarget = token.match(/^--(?:cwd|filter)=(.+)$/)?.[1];
			if (optionTarget) {
				const role = targetPortRole(optionTarget);
				if (role) roles.add(role);
				continue;
			}
			if (token.startsWith('-')) continue;
			const role = targetPortRole(token);
			if (role) roles.add(role);
			break;
		}
	} else if (commandName) {
		const role = targetPortRole(commandName);
		if (role) roles.add(role);
	}

	if (roles.size > 1) return null;
	return roles.values().next().value ?? genericPortRole(stack);
}

function scriptPortRole(name: string, command: string, stack: ProjectStack): null | PortRole {
	if (FRONTEND_COMMAND.test(command) || FRONTEND_SCRIPT.test(name)) return 'frontend';
	if (BACKEND_SCRIPT.test(name)) return 'backend';
	const bunRole = bunPortRole(command, stack);
	if (bunRole !== undefined) return bunRole;
	if (BACKEND_COMMAND.test(command)) return 'backend';
	return genericPortRole(stack);
}

function addPort(ports: Map<PortRole, Set<number>>, role: PortRole, port: number): void {
	let values = ports.get(role);
	if (!values) {
		values = new Set();
		ports.set(role, values);
	}
	values.add(port);
}

function resolvedPort(ports: Map<PortRole, Set<number>>, role: PortRole): null | number {
	const values = ports.get(role);
	return values?.size === 1 ? ([...values][0] ?? null) : null;
}

function environmentPortRole(key: string, stack: ProjectStack): null | PortRole {
	if (['FRONTEND_PORT', 'VITE_PORT', 'WEB_PORT'].includes(key)) return 'frontend';
	if (['API_PORT', 'BACKEND_PORT', 'SERVER_PORT'].includes(key)) return 'backend';
	return key === 'PORT' ? genericPortRole(stack) : null;
}

function environmentPort(line: string): { key: string; port: number } | null {
	const match = line.match(
		/^\s*(?:export\s+)?(API_PORT|BACKEND_PORT|FRONTEND_PORT|PORT|SERVER_PORT|VITE_PORT|WEB_PORT)\s*=\s*["']?(\d+)["']?(?:\s*(?:#.*)?)$/,
	);
	if (!match?.[1] || !match[2]) return null;
	const port = portFromText(match[2]);
	return port === null ? null : { key: match[1], port };
}

export async function runtimePortDeclarationPaths(projectDir: string): Promise<string[]> {
	const manifestPaths = await projectPackageManifestPaths(projectDir);
	const directories = new Set([projectDir, ...manifestPaths.map(dirname)]);
	return [
		...manifestPaths,
		...[...directories].flatMap((directory) =>
			ENVIRONMENT_FILES.map((name) => join(directory, name)),
		),
	].sort();
}

export async function gatherRuntimePorts(
	projectDir: string,
	stack: ProjectStack,
): Promise<null | ProjectPorts> {
	const ports = new Map<PortRole, Set<number>>();
	const paths = await runtimePortDeclarationPaths(projectDir);
	for (const path of paths.filter((candidate) => candidate.endsWith('package.json'))) {
		const pkg = (await readProjectPackage(path)) as null | PackageJson;
		for (const [name, value] of Object.entries(pkg?.scripts ?? {})) {
			if (typeof value !== 'string') continue;
			const port = commandPort(value);
			const role = port === null ? null : scriptPortRole(name, value, stack);
			if (port !== null && role !== null) addPort(ports, role, port);
		}
	}
	for (const path of paths.filter((candidate) => !candidate.endsWith('package.json'))) {
		const content = await readTextOrNull(path);
		if (content === null) continue;
		for (const line of content.split('\n')) {
			const declaration = environmentPort(line);
			const role = declaration ? environmentPortRole(declaration.key, stack) : null;
			if (declaration && role) addPort(ports, role, declaration.port);
		}
	}
	const backendPort = resolvedPort(ports, 'backend');
	const frontendPort = resolvedPort(ports, 'frontend');
	return backendPort === null && frontendPort === null ? null : { backendPort, frontendPort };
}
