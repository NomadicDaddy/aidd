export type ProjectReportKind = 'bug' | 'feature';

export type ProjectReportStatus = 'closed' | 'in_progress' | 'open' | 'resolved';

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
