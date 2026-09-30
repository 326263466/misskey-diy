/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AbuseReportSnapshot, MiAbuseUserReport } from '@/models/AbuseUserReport.js';

export function serializeAbuseReportSnapshot(snapshot: AbuseReportSnapshot | null) {
	if (snapshot == null) return null;
	return {
		...snapshot,
		files: snapshot.files.map(({ archive, ...file }) => ({ ...file, sha256: archive.sha256 })),
	};
}

export function serializeAbuseReport(report: MiAbuseUserReport) {
	return {
		id: report.id,
		targetUserId: report.targetUserId,
		targetUserHost: report.targetUserHost,
		reporterId: report.reporterId,
		reporterHost: report.reporterHost,
		assigneeId: report.assigneeId,
		resolved: report.resolved,
		forwarded: report.forwarded,
		comment: report.comment,
		reason: report.reason,
		snapshot: serializeAbuseReportSnapshot(report.snapshot),
		moderationNote: report.moderationNote,
		resolvedAs: report.resolvedAs,
	};
}

export function formatAbuseReport(report: Pick<MiAbuseUserReport, 'reason' | 'comment' | 'snapshot'>): string {
	const snapshot = report.snapshot;
	return [
		report.reason ? `Reason: ${report.reason}` : null,
		report.comment,
		snapshot == null ? null : [
			`Snapshot: ${snapshot.capturedAt}`,
			`@${snapshot.user.username}${snapshot.user.host == null ? '' : `@${snapshot.user.host}`}`,
			snapshot.content,
			snapshot.sourceUrl,
			...snapshot.files.map(file => `${file.name} (${file.type}, ${file.size} bytes, SHA-256: ${file.archive.sha256})`),
		].filter(Boolean).join('\n'),
	].filter(Boolean).join('\n\n');
}
