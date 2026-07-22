import { existingFeature } from '../src/existing.js';

if (existingFeature() !== 'implemented') {
	console.error('existingFeature() is not implemented correctly');
	process.exit(1);
}
