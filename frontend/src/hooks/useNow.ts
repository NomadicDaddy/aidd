import { useEffect, useState } from 'react';

export function useNow(enabled: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!enabled) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- re-reads the system clock on enable; a value held while paused is stale.
		setNow(Date.now());
		const interval = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [enabled]);
	return now;
}
