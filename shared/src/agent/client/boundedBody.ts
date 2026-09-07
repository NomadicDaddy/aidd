import { DEFAULT_MAX_STREAM_CHARS } from './stream.ts';

// Match the streaming response ceiling numerically, measured in bytes before decoding JSON.
const MAX_RESPONSE_BYTES = DEFAULT_MAX_STREAM_CHARS;

export async function readBoundedProviderBody(response: Response): Promise<string> {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text + decoder.decode();
			bytes += value.byteLength;
			if (bytes > MAX_RESPONSE_BYTES) {
				throw new Error(`Provider response exceeds ${MAX_RESPONSE_BYTES} bytes`);
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}
