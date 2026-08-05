import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';

import type { RecipeStepOnFailure, RecipeStepType } from '../../api/types.ts';
import type { StepDraft, StepJsonErrors } from './recipe-steps.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass, textareaClass } from '../../lib/formStyles.ts';

const jsonTextareaClass = `${textareaClass} font-mono text-xs`;
const errorTextareaClass = `${jsonTextareaClass} border-red-500 focus-visible:border-red-500 focus-visible:ring-red-200 dark:border-red-500 dark:focus-visible:border-red-500 dark:focus-visible:ring-red-900`;

type JsonFieldKey = 'configJson' | 'postHookJson' | 'preHookJson';

interface RecipeStepEditorProps {
	errors: StepJsonErrors;
	index: number;
	onChange: (patch: Partial<StepDraft>) => void;
	onDelete: () => void;
	step: StepDraft;
}

function JsonField({
	error,
	label,
	onChange,
	open: forcedOpen,
	stepId,
	value,
}: {
	error: null | string;
	label: JsonFieldKey;
	onChange: (next: string) => void;
	open?: boolean;
	stepId: string;
	value: string;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const isOpen = forcedOpen ?? !collapsed;
	const hasContent = value.trim().length > 0;
	const errorId = `${stepId}-${label}-error`;

	return (
		<div>
			<Button
				className="text-muted-foreground uppercase hover:text-foreground"
				onClick={() => setCollapsed((c) => !c)}
				size="compact"
				variant="ghost">
				{isOpen ? (
					<ChevronDown className="h-3.5 w-3.5" />
				) : (
					<ChevronRight className="h-3.5 w-3.5" />
				)}
				{label}
				{!isOpen && hasContent && (
					<span className="text-muted-foreground normal-case">(set)</span>
				)}
			</Button>
			{isOpen && (
				<label className="mt-1 grid gap-1">
					<textarea
						aria-describedby={error ? errorId : undefined}
						aria-invalid={Boolean(error)}
						aria-label={label}
						className={error ? errorTextareaClass : jsonTextareaClass}
						data-testid={`step-${stepId}-${label}`}
						onChange={(event) => onChange(event.target.value)}
						value={value}
					/>
					{error ? (
						<p
							className="text-xs font-medium text-red-600 dark:text-red-400"
							id={errorId}
							role="alert">
							{error}
						</p>
					) : null}
				</label>
			)}
		</div>
	);
}

export function RecipeStepEditor({
	errors,
	index,
	onChange,
	onDelete,
	step,
}: RecipeStepEditorProps) {
	return (
		<div className="space-y-3 rounded-md border border-border p-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<Badge>Step {index + 1}</Badge>
					<h3 className="mt-2 text-base font-semibold text-foreground">{step.name}</h3>
				</div>
				<Button onClick={onDelete} variant="danger">
					<Trash2 className="h-4 w-4" />
					Delete
				</Button>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<FieldRow label="Step name">
					<Input
						name="step-name"
						onChange={(event) => onChange({ name: event.target.value })}
						value={step.name}
					/>
				</FieldRow>
				<FieldRow label="Step type">
					<select
						className={`${selectClass} w-full`}
						name="step-type"
						onChange={(event) =>
							onChange({
								skillExecutionIntent: 'review-only',
								stepType: event.target.value as RecipeStepType,
							})
						}
						value={step.stepType}>
						<option value="aidd-cli">aidd-cli</option>
						<option value="skill">skill</option>
						<option value="shell">shell</option>
						<option value="recipe-ref">recipe-ref</option>
					</select>
				</FieldRow>
				<FieldRow label="Failure behavior">
					<select
						className={`${selectClass} w-full`}
						name="step-on-failure"
						onChange={(event) =>
							onChange({ onFailure: event.target.value as RecipeStepOnFailure })
						}
						value={step.onFailure}>
						<option value="stop">stop</option>
						<option value="continue">continue</option>
						<option value="auto-fix">auto-fix</option>
					</select>
				</FieldRow>
				<FieldRow label="Retry count">
					<Input
						name="step-retry-count"
						onChange={(event) => onChange({ retryCount: event.target.value })}
						type="number"
						value={step.retryCount}
					/>
				</FieldRow>
			</div>
			{step.stepType === 'skill' ? (
				<FieldRow className="max-w-xs" label="Execution intent">
					<select
						className={`${selectClass} w-full`}
						onChange={(event) =>
							onChange({
								skillExecutionIntent: event.target.value as SkillExecutionIntent,
							})
						}
						value={step.skillExecutionIntent}>
						<option value="review-only">Review only</option>
						<option value="apply-changes">Apply changes</option>
					</select>
					<span className="text-xs text-muted-foreground">
						Skill steps are directives, not audits. Apply changes permits edits and
						commits.
					</span>
				</FieldRow>
			) : null}
			<div className="grid gap-3 md:grid-cols-2">
				<FieldRow label="Run when parameter">
					<Input
						aria-invalid={Boolean(errors.when)}
						onChange={(event) => onChange({ whenParameter: event.target.value })}
						placeholder="stopBeforeImplementation"
						value={step.whenParameter}
					/>
				</FieldRow>
				<FieldRow label="Equals">
					<Input
						aria-invalid={Boolean(errors.when)}
						onChange={(event) => onChange({ whenEquals: event.target.value })}
						placeholder="false"
						value={step.whenEquals}
					/>
				</FieldRow>
				{errors.when ? (
					<p className="text-xs font-medium text-red-600 md:col-span-2 dark:text-red-400">
						{errors.when}
					</p>
				) : null}
			</div>
			<div className="grid gap-3 lg:grid-cols-3">
				<JsonField
					error={errors.configJson}
					label="configJson"
					onChange={(next) => onChange({ configJson: next })}
					open={true}
					stepId={step.id}
					value={step.configJson}
				/>
				<JsonField
					error={errors.preHookJson}
					label="preHookJson"
					onChange={(next) => onChange({ preHookJson: next })}
					stepId={step.id}
					value={step.preHookJson}
				/>
				<JsonField
					error={errors.postHookJson}
					label="postHookJson"
					onChange={(next) => onChange({ postHookJson: next })}
					stepId={step.id}
					value={step.postHookJson}
				/>
			</div>
		</div>
	);
}
