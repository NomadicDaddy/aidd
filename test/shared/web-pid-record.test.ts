import { describe, expect, test } from 'bun:test';

import { formatWebPidRecord, parseWebPidRecord } from '../../shared/src/lib/webPidRecord.ts';

describe('web backend pid record', () => {
	test('round-trips a pid with its start-time token', () => {
		const text = formatWebPidRecord({ pid: 4321, startId: '133912345678901234' });
		expect(parseWebPidRecord(text)).toEqual({ pid: 4321, startId: '133912345678901234' });
	});

	test('accepts a record without a start time', () => {
		expect(parseWebPidRecord('{"pid":7}')).toEqual({ pid: 7 });
	});

	test('rejects a bare pid, which carries no identity', () => {
		expect(parseWebPidRecord('4321\n')).toBeNull();
	});

	test('rejects torn or malformed records', () => {
		expect(parseWebPidRecord('{"pid":43')).toBeNull();
		expect(parseWebPidRecord('{"pid":0}')).toBeNull();
		expect(parseWebPidRecord('{"pid":1.5}')).toBeNull();
		expect(parseWebPidRecord('{"pid":9,"startId":""}')).toBeNull();
		expect(parseWebPidRecord('{"pid":9,"startId":42}')).toBeNull();
		expect(parseWebPidRecord('null')).toBeNull();
	});
});
