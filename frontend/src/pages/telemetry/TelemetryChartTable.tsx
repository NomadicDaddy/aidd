export interface TelemetryChartTableRow {
	bucket: string;
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
		<table className="sr-only">
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
						<th scope="row">{row.bucket}</th>
						{row.values.map((value, index) => (
							<td key={columns[index]}>{value.toLocaleString()}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
