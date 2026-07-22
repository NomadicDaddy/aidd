/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';

export function useNow(enabled: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!enabled) return;
		setNow(Date.now());
		const interval = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [enabled]);
	return now;
}
