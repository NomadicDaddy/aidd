import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

import type { ApiTypePair, ApiTypeReference } from './inventory.ts';

export interface TypeParityFinding {
	message: string;
	pair: ApiTypePair;
}

function compilerOptions(root: string): ts.CompilerOptions {
	const configPath = ts.findConfigFile(root, existsSync, 'tsconfig.json');
	if (configPath === undefined) {
		return {
			allowImportingTsExtensions: true,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noEmit: true,
			strict: true,
			target: ts.ScriptTarget.ES2022,
		};
	}
	const loaded = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
	if (loaded.error)
		throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
	const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath));
	const options = { ...parsed.options, incremental: false, noEmit: true };
	delete options.tsBuildInfoFile;
	return options;
}

function resolveType(
	checker: ts.TypeChecker,
	program: ts.Program,
	root: string,
	reference: ApiTypeReference,
): ts.Type {
	const path = resolve(root, reference.module);
	const file = program.getSourceFile(path);
	if (file === undefined)
		throw new Error(`type module is not in the program: ${reference.module}`);
	const moduleSymbol = checker.getSymbolAtLocation(file);
	if (moduleSymbol === undefined)
		throw new Error(`type module has no exports: ${reference.module}`);
	const symbol = checker
		.getExportsOfModule(moduleSymbol)
		.find((entry) => entry.name === reference.exportName);
	if (symbol === undefined) {
		throw new Error(`${reference.module} does not export ${reference.exportName}`);
	}
	return checker.getDeclaredTypeOfSymbol(symbol);
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
	if (!diagnostic.file || diagnostic.start === undefined) return message;
	const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
	return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

export function checkTypeParity(root: string, pairs: ApiTypePair[]): TypeParityFinding[] {
	const roots = [
		...new Set(
			pairs.flatMap((pair) => [
				resolve(root, pair.backend.module),
				resolve(root, pair.frontend.module),
			]),
		),
	];
	const program = ts.createProgram({ options: compilerOptions(root), rootNames: roots });
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		throw new Error(`type program failed:\n${diagnostics.map(diagnosticText).join('\n')}`);
	}
	const checker = program.getTypeChecker();
	const findings: TypeParityFinding[] = [];
	for (const pair of pairs) {
		const backend = resolveType(checker, program, root, pair.backend);
		const frontend = resolveType(checker, program, root, pair.frontend);
		if (
			!checker.isTypeAssignableTo(backend, frontend) ||
			!checker.isTypeAssignableTo(frontend, backend)
		) {
			findings.push({
				message:
					`${pair.backend.module}#${pair.backend.exportName} and ` +
					`${pair.frontend.module}#${pair.frontend.exportName} are not bidirectionally assignable`,
				pair,
			});
		}
	}
	return findings;
}
