export interface RunHistorySourceReaders<WebItem, CliItem, DirectorItem> {
	cli: () => Promise<CliItem[]>;
	director: () => Promise<DirectorItem[]>;
	web: () => Promise<WebItem[]>;
}

export interface RunHistorySourceResults<WebItem, CliItem, DirectorItem> {
	cliItems: CliItem[];
	directorItems: DirectorItem[];
	webItems: WebItem[];
}

export async function readRunHistorySources<WebItem, CliItem, DirectorItem>(
	readers: RunHistorySourceReaders<WebItem, CliItem, DirectorItem>,
): Promise<RunHistorySourceResults<WebItem, CliItem, DirectorItem>> {
	const webPromise = readers.web();
	const cliPromise = readers.cli();
	const directorPromise = readers.director();
	const [webItems, cliItems, directorItems] = await Promise.all([
		webPromise,
		cliPromise,
		directorPromise,
	]);
	return { cliItems, directorItems, webItems };
}
