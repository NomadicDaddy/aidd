export interface ColumnRow {
	name: string;
}

export interface ForeignKeyRow {
	from: string;
	table: string;
	to: string;
}

export interface IndexInfoRow {
	name: string;
	origin: string;
}

export interface TableSqlRow {
	name: string;
	sql: string;
}
