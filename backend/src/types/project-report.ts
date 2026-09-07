export type ProjectReportKind = 'bug' | 'feature';

// Derived from the backing feature record by reportStatusFromFeature; there is no separate
// close action, so a resolved report is the terminal state and nothing ever produced 'closed'.
export type ProjectReportStatus = 'in_progress' | 'open' | 'resolved';

export interface ProjectReportMetadataDto {
	pathname?: string;
	url?: string;
	userAgent?: string;
	viewport?: {
		height: number;
		width: number;
	};
}

export interface ProjectReportEntryDto {
	classificationReason?: string;
	createdAt: string;
	description: string;
	featureDirectory?: string;
	featureId?: string;
	id: string;
	kind: ProjectReportKind;
	metadata?: ProjectReportMetadataDto;
	reportedBy: {
		username: string;
	};
	status: ProjectReportStatus;
}

export interface ProjectReportSubmitDto {
	description: string;
	kind: ProjectReportKind;
	metadata?: ProjectReportMetadataDto;
}

export interface ProjectReportsResponseDto {
	bugs: ProjectReportEntryDto[];
	lastUpdated: null | string;
}
