export interface TelemetryChartTableRow {
	bucket: number;
	label: string;
	values: readonly number[];
}

export function TelemetryChartTable({
	caption,
	columns,
	rows,
}: {
	caption: string;
	columns: readonly string[];
	rows: readonly TelemetryChartTableRow[];
}) {
	return (
		<div className="sr-only">
			<table>
				<caption>{caption}</caption>
				<thead>
					<tr>
						<th scope="col">Time bucket</th>
						{columns.map((column) => (
							<th key={column} scope="col">
								{column}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.bucket}>
							<th scope="row">{row.label}</th>
							{row.values.map((value, index) => (
								<td key={columns[index]}>{value.toLocaleString()}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
