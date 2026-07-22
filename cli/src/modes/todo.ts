import type { ModeContext, ModeHandler, ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { metadataPath } from 'aidd-shared/metadata/paths';
import { readFile, writeFile } from 'node:fs/promises';

import { createPlanBackedMode } from './base.ts';

function parseIncompleteTodos(text: string): string[] {
	return text
		.split(/\r?\n/)
		.filter((line) => /^\s*-\s*\[\s*\]/.test(line))
		.map((line) => line.replace(/^\s*-\s*\[\s*\]\s*/, '').trim())
		.filter(Boolean);
}

function completeTodoLine(text: string, selected: string): { changed: boolean; text: string } {
	let changed = false;
	const lines = text.split(/\r?\n/).map((line) => {
		if (changed || !/^\s*-\s*\[\s*\]/.test(line)) return line;
		const todoText = line.replace(/^\s*-\s*\[\s*\]\s*/, '').trim();
		if (todoText !== selected) return line;
		changed = true;
		return line.replace(/\[\s*\]/, '[x]');
	});
	return { changed, text: lines.join('\n') };
}

export function createTodoMode(plan: RunPlan): ModeHandler {
	const base = createPlanBackedMode(plan);
	return {
		...base,
		name: 'todo',
		async processResult(_context, result): Promise<ModeResult> {
			const selectedWork = result.selectedWork;
			const todoPath =
				typeof selectedWork?.data === 'object' &&
				selectedWork.data !== null &&
				'todoPath' in selectedWork.data &&
				typeof selectedWork.data.todoPath === 'string'
					? selectedWork.data.todoPath
					: undefined;
			const shouldComplete =
				result.exitCode === 0 &&
				selectedWork?.kind === 'todo' &&
				result.structuredResult?.todoCompleted === true &&
				todoPath !== undefined;
			let completedTodo = false;
			if (shouldComplete && selectedWork) {
				const current = await readFile(todoPath, 'utf8');
				const updated = completeTodoLine(current, selectedWork.description);
				if (updated.changed) {
					await writeFile(todoPath, updated.text);
					completedTodo = true;
				}
			}
			return {
				artifacts: { completedTodo },
				complete: result.exitCode === 0,
				summary: result.skipped
					? 'todo has no incomplete items'
					: completedTodo
						? `todo completed: ${selectedWork?.description}`
						: `todo finished with exit code ${result.exitCode}`,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			const todoPath = metadataPath(context.projectDir, 'todo.md');
			try {
				const todos = parseIncompleteTodos(await readFile(todoPath, 'utf8'));
				if (todos[0]) {
					return {
						data: { remaining: todos.length, todoPath },
						description: todos[0],
						id: 'todo-1',
						kind: 'todo',
					};
				}
			} catch {
				// Missing todo.md is not an error.
			}
			return {
				description: 'No incomplete TODO items are available',
				id: 'no-todos',
				kind: 'none',
			};
		},
	};
}
