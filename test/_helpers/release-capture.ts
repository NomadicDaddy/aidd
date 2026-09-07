import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { releaseSource, sha256 } from '../../scripts/lib/release-build.ts';
import {
	beginReleaseCapture,
	captureReleaseBuild,
	finishReleaseCapture,
	RELEASE_VIEWPORT,
} from '../../scripts/lib/release-capture.ts';
import { testTempDirSync } from './temp.ts';

export function fixtureGit(root: string, ...args: string[]): string {
	const result = Bun.spawnSync(['git', ...args], {
		cwd: root,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

function chunk(type: string, data: Buffer): Buffer {
	const payload = Buffer.concat([Buffer.from(type), data]);
	let crc = 0xffffffff;
	for (const byte of payload) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
	return Buffer.concat([length, payload, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(RELEASE_VIEWPORT.width, 0);
header.writeUInt32BE(RELEASE_VIEWPORT.height, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
	Buffer.from('89504e470d0a1a0a', 'hex'),
	chunk('IHDR', header),
	chunk(
		'IDAT',
		deflateSync(Buffer.alloc((RELEASE_VIEWPORT.width * 4 + 1) * RELEASE_VIEWPORT.height)),
	),
	chunk('IEND', Buffer.alloc(0)),
]);

export async function releaseFixture(declared = true, serveIndex?: (html: string) => string) {
	const root = testTempDirSync('release-capture');
	fixtureGit(root, 'init', '--quiet');
	fixtureGit(root, 'config', 'user.name', 'Capture fixture');
	fixtureGit(root, 'config', 'user.email', 'capture@example.invalid');
	fixtureGit(root, 'config', 'core.hooksPath', '.git/hooks');
	const routes = ['/one', '/two', '/three', '/four', '/five'];
	const contract = { routes, schema: 1, viewport: RELEASE_VIEWPORT };
	writeFileSync(join(root, 'package.json'), '{"version":"1.0.0"}\n');
	writeFileSync(join(root, '.gitignore'), 'screenshots/\nfrontend/dist/\n');
	if (declared) writeFileSync(join(root, '.screenshot-capture'), JSON.stringify(contract));
	fixtureGit(root, 'add', '.');
	fixtureGit(root, 'commit', '--quiet', '-m', 'Fixture candidate');
	const source = releaseSource(root);
	const versionDirectory = join(root, 'screenshots', 'v1.0.0');
	const dist = join(root, 'frontend', 'dist');
	mkdirSync(dist, { recursive: true });
	writeFileSync(join(dist, 'index.html'), '<html>fixture</html>');
	const build = {
		assets: [{ file: 'index.html', sha256: sha256('<html>fixture</html>') }],
		mode: 'production',
		source,
		timestamp: new Date().toISOString(),
		version: '1.0.0',
	};
	writeFileSync(join(dist, 'release-build.json'), JSON.stringify(build));
	const server = Bun.serve({
		fetch(request) {
			const file = new URL(request.url).pathname.slice(1) || 'index.html';
			const bytes = readFileSync(join(dist, file));
			return new Response(
				file === 'index.html' && serveIndex ? serveIndex(bytes.toString('utf8')) : bytes,
			);
		},
		port: 0,
	});
	const baseUrl = server.url.origin;
	const scope = { check404: true, page: null, startFrom: null, viewport: RELEASE_VIEWPORT };
	if (!declared) writeFileSync(join(root, '.screenshot-capture'), JSON.stringify(contract));
	const capture = beginReleaseCapture(root, versionDirectory, scope);
	const images = routes.map((route) => ({ file: `${route.slice(1)}.png`, route }));
	for (const image of images) writeFileSync(join(capture.directory, image.file), png);
	const report = {
		summary: { screenshotsTaken: 5, success: true },
		visitedUrls: routes.map((route) => baseUrl + route),
	};
	try {
		if (declared) {
			const before = await captureReleaseBuild(root, baseUrl);
			if (!(await finishReleaseCapture(root, baseUrl, capture, report, [], images, before))) {
				throw new Error('Fixture producer rejected a complete matching capture.');
			}
		}
	} finally {
		await server.stop(true);
	}
	const manifestPath = join(capture.directory, 'crawl-result.json');
	return { capture, contract, images, manifestPath, root, scope, source, versionDirectory };
}
