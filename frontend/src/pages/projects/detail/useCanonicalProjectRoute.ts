import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useCanonicalProjectRoute(
	currentRouteId: string | undefined,
	canonicalRouteId: string | undefined,
): void {
	const location = useLocation();
	const navigate = useNavigate();
	useEffect(() => {
		if (!canonicalRouteId || !currentRouteId || currentRouteId === canonicalRouteId) return;
		void navigate(
			{
				pathname: `/projects/${encodeURIComponent(canonicalRouteId)}`,
				search: location.search,
			},
			{ replace: true },
		);
	}, [canonicalRouteId, currentRouteId, location.search, navigate]);
}
