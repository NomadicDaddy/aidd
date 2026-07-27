import { useSearchParams } from 'react-router';

import type { AuditsTab } from './auditsUtils.ts';

import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { TabList, TabPanel } from '../../components/ui/tabs.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { auditsTabSearchParams, readAuditsTab } from './auditsNavigation.ts';
import { ApplicabilityTab } from './tabs/ApplicabilityTab.tsx';
import { CatalogTab } from './tabs/CatalogTab.tsx';
import { OverridesTab } from './tabs/OverridesTab.tsx';

const TABS = [
	{ id: 'catalog', label: 'Catalog' },
	{ id: 'applicability', label: 'Applicability' },
	{ id: 'overrides', label: 'Project Overrides' },
] as const satisfies readonly { id: AuditsTab; label: string }[];

export function AuditsPage() {
	useDocumentTitle('Audits');
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = readAuditsTab(searchParams.get('tab'));
	const changeTab = (tab: AuditsTab): void => {
		setSearchParams(auditsTabSearchParams(searchParams, tab), { replace: false });
	};

	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				description="Audit definitions, applicability matrix, and per-project overrides."
				helpSlug="audits"
				title="Audits"
			/>
			<TabList
				activeTab={activeTab}
				ariaLabel="Audits sections"
				idPrefix="audits"
				onChange={changeTab}
				tabs={TABS}
			/>
			<TabPanel activeTab={activeTab} id="catalog" idPrefix="audits">
				<CatalogTab onJumpToMatrix={() => changeTab('applicability')} />
			</TabPanel>
			<TabPanel activeTab={activeTab} id="applicability" idPrefix="audits">
				<ApplicabilityTab />
			</TabPanel>
			<TabPanel activeTab={activeTab} id="overrides" idPrefix="audits">
				<OverridesTab />
			</TabPanel>
		</div>
	);
}
