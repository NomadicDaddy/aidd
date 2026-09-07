import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { default as Lock } from 'lucide-react/dist/esm/icons/lock';
import { useId } from 'react';

import type { SelectableTargetType } from './targetBuilder.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useAuditManager } from '../../hooks/useAudits.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { useSkills } from '../../hooks/useSkills.ts';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { autoParameters } from '../recipes/recipe-parameters.ts';
import { findTargetRecipe } from './scheduledTargetRecipe.ts';

type TargetType = SelectableTargetType;

interface ScheduledTargetFieldsProps {
	args: string;
	nameField: ReactNode;
	onArgsChange: (value: string) => void;
	onTargetIdChange: (value: string) => void;
	onTargetTypeChange: (value: TargetType) => void;
	parameters: Record<string, string>;
	setParameters: Dispatch<SetStateAction<Record<string, string>>>;
	targetId: string;
	targetType: TargetType;
}

export function ScheduledFixedTarget() {
	const labelId = useId();

	return (
		<div className={`grid gap-1 ${compactFieldMeasureClass}`}>
			<span className={fieldLabelClass} id={labelId}>
				Target
			</span>
			<div
				aria-labelledby={labelId}
				className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted px-3 sm:h-9 sm:min-h-0"
				role="group">
				<Lock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate text-sm text-foreground">
					Director fleet cycle
				</span>
				<Badge className="bg-card" tone="neutral">
					Fixed
				</Badge>
			</div>
		</div>
	);
}

export function ScheduledTargetFields({
	args,
	nameField,
	onArgsChange,
	onTargetIdChange,
	onTargetTypeChange,
	parameters,
	setParameters,
	targetId,
	targetType,
}: ScheduledTargetFieldsProps) {
	const recipeQuery = useRecipes();
	const skillQuery = useSkills();
	const auditQuery = useAuditManager();

	const targetOptions = (() => {
		if (targetType === 'recipe') {
			return (recipeQuery.recipes.data ?? []).map((item) => ({
				id: item.id,
				name: item.id,
			}));
		}
		if (targetType === 'skill') {
			return (skillQuery.skills.data ?? []).map((item) => ({
				id: item.id,
				name: item.title,
			}));
		}
		return (auditQuery.data?.definitions ?? []).map((item) => ({
			id: item.name,
			name: item.name,
		}));
	})();
	const selectedRecipe = findTargetRecipe(recipeQuery.recipes.data ?? [], targetType, targetId);
	const recipeParameters =
		selectedRecipe?.parameters.filter((parameter) => !autoParameters.has(parameter.name)) ?? [];
	const targetNameClass =
		targetId && targetType !== 'skill' && targetId !== '*' ? 'font-mono' : undefined;
	const targetOptionClass = targetType === 'skill' ? undefined : 'font-mono';

	return (
		<>
			<FieldRow label="Target type">
				<select
					className={selectClass}
					onChange={(e) => onTargetTypeChange(e.target.value as TargetType)}
					value={targetType}>
					<option value="skill">Skill</option>
					<option value="recipe">Recipe</option>
					<option value="audit">Audit</option>
				</select>
			</FieldRow>
			<FieldRow label="Target" required>
				<select
					className={cn(selectClass, targetNameClass)}
					onChange={(e) => onTargetIdChange(e.target.value)}
					value={targetId}>
					<option value="">Select target</option>
					{targetType === 'audit' && <option value="*">All audits</option>}
					{targetOptions.map((item) => (
						<option className={targetOptionClass} key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
			</FieldRow>
			{nameField}
			{targetType === 'skill' && (
				<FieldRow label="Arguments">
					<Input
						onChange={(e) => onArgsChange(e.target.value)}
						placeholder="--filter remediation-*"
						value={args}
					/>
				</FieldRow>
			)}
			{targetType === 'recipe' &&
				recipeParameters.map((parameter) => (
					<FieldRow key={parameter.name} label={parameter.name}>
						<Input
							onChange={(event) =>
								setParameters((current) => ({
									...current,
									[parameter.name]: event.target.value,
								}))
							}
							placeholder={parameter.description ?? parameter.name}
							value={parameters[parameter.name] ?? parameter.defaultValue ?? ''}
						/>
					</FieldRow>
				))}
		</>
	);
}
