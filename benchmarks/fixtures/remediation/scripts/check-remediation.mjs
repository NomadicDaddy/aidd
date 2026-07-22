import { greeting } from '../src/greeting.js';

const value = greeting('Ada');

if (value !== 'Hello, Ada!') {
	console.error(`Expected "Hello, Ada!" but received "${value}"`);
	process.exit(1);
}
