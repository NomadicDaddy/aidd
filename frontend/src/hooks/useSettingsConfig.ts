import { useQuery } from '@tanstack/react-query';

import { getSettingsConfig } from '../api/settingsConfig.ts';

export function useSettingsConfig() {
	return useQuery({
		queryFn: getSettingsConfig,
		queryKey: ['settings-config'],
	});
}
