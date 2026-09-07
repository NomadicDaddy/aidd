export interface MatrixCellPosition {
	column: number;
	row: number;
}

/** Resolve the next cell in the audit applicability grid without wrapping between edges. */
export function resolveMatrixCellFocus(
	current: MatrixCellPosition,
	key: string,
	rowCount: number,
	columnCount: number,
): MatrixCellPosition | undefined {
	if (rowCount < 1 || columnCount < 1) return undefined;

	switch (key) {
		case 'ArrowDown':
			return { ...current, row: Math.min(rowCount - 1, current.row + 1) };
		case 'ArrowLeft':
			return { ...current, column: Math.max(0, current.column - 1) };
		case 'ArrowRight':
			return { ...current, column: Math.min(columnCount - 1, current.column + 1) };
		case 'ArrowUp':
			return { ...current, row: Math.max(0, current.row - 1) };
		case 'End':
			return { ...current, column: columnCount - 1 };
		case 'Home':
			return { ...current, column: 0 };
		default:
			return undefined;
	}
}
