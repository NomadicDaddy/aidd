import { greeting } from '../src/greeting.js';

if (typeof greeting !== 'function') {
	console.error('greeting export is missing');
	process.exit(1);
}
