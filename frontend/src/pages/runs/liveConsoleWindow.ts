import { utf8ByteLength } from '../../lib/formatters.ts';
import { windowTail } from './liveConsoleText.tsx';

// The on-disk size and the loaded transcript are sampled at different instants, so a running run
// writes more between the two reads. Below this, the gap is that race or a handful of lines, not
// something worth warning an operator about.
const TRIVIAL_ELISION_BYTES = 4096;

export interface ConsoleWindow {
	isWindowed: boolean;
	messageBytes: number;
	renderedBytes: number;
	renderedMessage: string;
	totalBytes: number;
}

/**
 * How much of the transcript the raw view lays out, and whether enough is missing to say so. The
 * displayed total is the larger of what we hold in memory and the server's reported on-disk size,
 * so a server-side tail cap still reports the true file size.
 *
 * Every quantity here is UTF-8 bytes, the unit `sourceTotalBytes` and the notice both speak.
 * Measuring the string with `.length` instead mixed UTF-16 code units into that comparison, which
 * understated a non-ASCII transcript against its own file size — enough of it and the shortfall
 * clears the floor below and warns about hidden output over a transcript that is entirely present.
 */
export function describeWindow(
	message: string,
	sourceTotalBytes: null | number | undefined,
): ConsoleWindow {
	const renderedMessage = windowTail(message);
	const messageBytes = utf8ByteLength(message);
	const renderedBytes =
		renderedMessage.length === message.length ? messageBytes : utf8ByteLength(renderedMessage);
	const totalBytes = Math.max(messageBytes, sourceTotalBytes ?? 0);
	const hidden = Math.max(totalBytes - messageBytes, messageBytes - renderedBytes);
	return {
		isWindowed: hidden > TRIVIAL_ELISION_BYTES,
		messageBytes,
		renderedBytes,
		renderedMessage,
		totalBytes,
	};
}
