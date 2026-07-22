/* eslint-disable import/no-default-export */
// `{ type: 'text' }` imports resolve to the file's contents.
declare module '*.sql' {
	const contents: string;
	export default contents;
}
