import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const HTTP_METHODS = new Set(['delete', 'get', 'patch', 'post', 'put']);

function routePrefix(source: ts.SourceFile): string {
	let prefix = '';
	function visit(node: ts.Node): void {
		if (
			prefix !== '' ||
			!ts.isNewExpression(node) ||
			node.expression.getText(source) !== 'Elysia'
		) {
			ts.forEachChild(node, visit);
			return;
		}
		const options = node.arguments?.[0];
		if (!options || !ts.isObjectLiteralExpression(options)) return;
		const property = options.properties.find(
			(entry): entry is ts.PropertyAssignment =>
				ts.isPropertyAssignment(entry) && entry.name.getText(source) === 'prefix',
		);
		if (property && ts.isStringLiteralLike(property.initializer))
			prefix = property.initializer.text;
	}
	visit(source);
	return prefix;
}

function literalPath(node: ts.Expression): string | undefined {
	let value: string;
	if (ts.isStringLiteralLike(node)) {
		value = node.text;
	} else if (ts.isTemplateExpression(node)) {
		value = node.head.text;
		for (const span of node.templateSpans) {
			const isTrailingQuery =
				span.literal.text === '' &&
				ts.isCallExpression(span.expression) &&
				callName(span.expression) === 'buildQuery';
			value += `${isTrailingQuery ? '' : ':param'}${span.literal.text}`;
		}
	} else {
		return undefined;
	}
	return value.split('?')[0]?.replace(/:[A-Za-z][A-Za-z0-9_]*/g, ':param');
}

function callName(call: ts.CallExpression): string | undefined {
	if (ts.isIdentifier(call.expression)) return call.expression.text;
	if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
	return undefined;
}

function source(path: string): ts.SourceFile {
	return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

export function discoverBackendEndpoints(path: string): Set<string> {
	const file = source(path);
	const prefix = routePrefix(file);
	const endpoints = new Set<string>();
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const method = node.expression.name.text.toLowerCase();
			const pathNode = node.arguments[0];
			if (HTTP_METHODS.has(method) && pathNode) {
				const pathValue = literalPath(pathNode);
				if (pathValue !== undefined)
					endpoints.add(`${method.toUpperCase()} ${prefix}${pathValue}`);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return endpoints;
}

function frontendApiFiles(root: string): string[] {
	const apiRoot = join(root, 'frontend', 'src', 'api');
	const files: string[] = [];
	function walk(directory: string): void {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'types') walk(path);
			} else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'types.ts') {
				files.push(path);
			}
		}
	}
	walk(apiRoot);
	return files;
}

export function discoverFrontendModules(root: string, pathPrefix: string): string[] {
	return frontendApiFiles(root)
		.filter((path) =>
			[...discoverFrontendEndpoints(path)].some((endpoint) => {
				const route = endpoint.slice(endpoint.indexOf(' ') + 1);
				return route === pathPrefix || route.startsWith(`${pathPrefix}/`);
			}),
		)
		.map((path) => relative(root, path).replaceAll('\\', '/'))
		.sort();
}

export function discoverFrontendEndpoints(path: string): Set<string> {
	const file = source(path);
	const endpoints = new Set<string>();
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const name = callName(node);
			const pathNode = node.arguments[0];
			if ((name === 'apiGet' || name === 'apiSend') && pathNode) {
				const pathValue = literalPath(pathNode);
				if (pathValue?.startsWith('/api/') === true) {
					const methodNode = node.arguments[1];
					const method =
						name === 'apiGet'
							? 'GET'
							: methodNode && ts.isStringLiteralLike(methodNode)
								? methodNode.text.toUpperCase()
								: undefined;
					if (method !== undefined) endpoints.add(`${method} ${pathValue}`);
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return endpoints;
}
