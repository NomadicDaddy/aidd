/** One row of `PRAGMA table_info`: `pk` is the column's 1-based position in the primary key, 0 otherwise. */
export interface ColumnRow {
	dflt_value: null | string;
	name: string;
	notnull: number;
	pk: number;
	type: string;
}

/** What the Drizzle declaration says about one column, in the terms table_info reports. */
export interface DrizzleColumnShape {
	/** A literal default is declared (`.default(...)`); a `$defaultFn` is not a SQL default. */
	hasDefault: boolean;
	name: string;
	notNull: boolean;
	/** The declared SQL type, as `getSQLType()` returns it. */
	sqlType: string;
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
