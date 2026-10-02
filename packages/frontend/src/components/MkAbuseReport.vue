<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="resolved && resolvedAs === 'accept'" class="ti ti-check" style="color: var(--MI_THEME-success)"></i>
		<i v-else-if="resolved && resolvedAs === 'reject'" class="ti ti-x" style="color: var(--MI_THEME-error)"></i>
		<i v-else-if="resolved" class="ti ti-slash"></i>
		<i v-else class="ti ti-exclamation-circle" style="color: var(--MI_THEME-warn)"></i>
	</template>
	<template #label>
		<span :class="$style.reportLabel">
			<span>{{ targetAccount }}</span>
			<span :class="[$style.status, resolved ? $style.resolved : $style.unresolved]">{{ statusLabel }}</span>
		</span>
	</template>
	<template #caption>{{ summary }}</template>
	<template #suffix><MkTime :time="report.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<template v-if="!resolved">
				<MkButton :disabled="moderating" @click="resolve('accept')"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.accept }})</MkButton>
				<MkButton :disabled="moderating" @click="resolve('reject')"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.reject }})</MkButton>
				<MkButton :disabled="moderating" @click="resolve(null)"><i class="ti ti-slash"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts.other }})</MkButton>
			</template>
			<template v-if="report.targetUser?.host != null">
				<MkButton :disabled="forwarded || moderating" :wait="forwarding" primary @click="forward"><i class="ti ti-corner-up-right"></i> {{ forwarded ? i18n.ts._abuseUserReport.forwarded : i18n.ts._abuseUserReport.forward }}</MkButton>
				<div v-tooltip:dialog="i18n.ts._abuseUserReport.forwardDescription" class="_button _help"><i class="ti ti-help-circle"></i></div>
			</template>
			<button class="_button" :class="$style.more" :aria-label="i18n.ts.more" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
		</div>
	</template>

	<div :class="$style.details">
		<div :class="$style.reportSections">
			<section v-if="snapshot">
				<h3 :class="$style.heading">{{ snapshot.type === 'user' ? i18n.ts._abuseUserReport.profileSnapshot : i18n.ts._abuseUserReport.snapshot }}</h3>
				<div :class="$style.content" class="_gaps_s">
					<div :class="$style.snapshotUser" class="_selectable">
						<strong v-if="snapshot.user.name">{{ snapshot.user.name }}</strong>
						<span>@{{ snapshot.user.username }}<template v-if="snapshot.user.host">@{{ snapshot.user.host }}</template></span>
					</div>
					<div :class="$style.hint">{{ i18n.ts._abuseUserReport.snapshotCapturedAt }}: <MkTime :time="snapshot.capturedAt" mode="absolute"/></div>
					<div v-if="snapshot.content" :class="$style.text" class="_selectable">{{ snapshot.content }}</div>
					<div v-else-if="snapshotFiles.length === 0" :class="$style.hint">{{ snapshot.type === 'user' ? i18n.ts._abuseUserReport.profileSnapshotEmpty : i18n.ts._abuseUserReport.snapshotEmpty }}</div>
					<div v-if="snapshotFiles.length > 0" class="_gaps_s">
						<h4 :class="$style.heading">{{ i18n.ts._abuseUserReport.snapshotFiles }}</h4>
						<ul :class="$style.snapshotFiles">
							<li v-for="file in snapshotFiles" :key="file.id" class="_gaps_s">
								<button class="_button _textButton" :class="$style.evidenceDownload" :disabled="!$i || downloadingFiles.has(file.id)" :aria-label="`${i18n.ts.download}: ${file.name}`" @click="downloadEvidence(file)">
									<i class="ti ti-download" aria-hidden="true"></i> {{ file.name }}
								</button>
								<span :class="$style.hint">{{ file.type }} · {{ bytes(file.size) }}</span>
								<span :class="$style.hint">{{ i18n.ts._abuseUserReport.fileHash }}: <code>{{ file.sha256 }}</code></span>
								<span v-if="file.comment" :class="$style.text" class="_selectable">{{ file.comment }}</span>
							</li>
						</ul>
						<div :class="$style.hint">{{ i18n.ts._abuseUserReport.snapshotFilesDescription }}</div>
					</div>
				</div>
			</section>
			<div v-else :class="$style.hint">{{ i18n.ts._abuseUserReport.snapshotUnavailable }}</div>
			<section>
				<h3 :class="$style.heading">{{ i18n.ts._abuseReport.selectReason }}</h3>
				<span v-if="report.reason" :class="$style.reason">{{ i18n.ts._abuseReport._reasons[report.reason] }}</span>
				<div v-else :class="$style.hint">{{ i18n.ts._abuseUserReport.reasonNotProvided }}</div>
			</section>
			<section>
				<h3 :class="$style.heading">{{ i18n.ts._abuseReport.description }}</h3>
				<div v-if="report.comment" :class="[$style.content, $style.text]" class="_selectable">{{ report.comment }}</div>
				<div v-else :class="$style.hint">{{ i18n.ts._abuseUserReport.noDescription }}</div>
			</section>
		</div>
		<div>{{ i18n.ts.reporter }}: <MkAcct v-if="report.reporter" :user="report.reporter"/><template v-else>#{{ report.reporterId }}</template></div>

		<MkModerationNote v-model="moderationNote" :save="saveModerationNote"/>

		<div v-if="report.assignee">
			{{ i18n.ts.moderator }}:
			<MkAcct :user="report.assignee"/>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { apiUrl } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkModerationNote from '@/components/MkModerationNote.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import bytes from '@/filters/bytes.js';
import { $i } from '@/i.js';

const props = defineProps<{
	report: Misskey.entities.AdminAbuseUserReportsResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'resolved', reportId: string): void;
	(ev: 'refresh'): void;
}>();

const snapshot = computed(() => props.report.snapshot);
const targetAccount = computed(() => {
	const user = snapshot.value?.user ?? props.report.targetUser;
	return user ? `@${user.username}${user.host ? `@${user.host}` : ''}` : `#${props.report.targetUserId}`;
});
const snapshotFiles = computed(() => snapshot.value?.files ?? []);
const downloadingFiles = ref(new Set<string>());
const localResolution = ref<{ resolvedAs: 'accept' | 'reject' | null } | null>(null);
const resolved = computed(() => props.report.resolved || localResolution.value != null);
const resolvedAs = computed(() => localResolution.value != null ? localResolution.value.resolvedAs : props.report.resolvedAs);
const resolving = ref(false);
const forwarding = ref(false);
const forwardedLocally = ref(false);
const forwarded = computed(() => props.report.forwarded || forwardedLocally.value);
const moderating = computed(() => resolving.value || forwarding.value);

async function downloadEvidence(file: NonNullable<typeof snapshot.value>['files'][number]) {
	if ($i == null || downloadingFiles.value.has(file.id)) return;
	downloadingFiles.value.add(file.id);
	let objectUrl: string | null = null;
	try {
		const response = await window.fetch(`${apiUrl}/admin/abuse-report-evidence`, {
			method: 'POST',
			body: JSON.stringify({ reportId: props.report.id, fileId: file.id, i: $i.token }),
			credentials: 'omit',
			cache: 'no-store',
			headers: { 'Content-Type': 'application/json' },
		});
		if (!response.ok) throw new Error('Evidence download failed');
		objectUrl = URL.createObjectURL(await response.blob());
		const link = window.document.createElement('a');
		link.href = objectUrl;
		link.download = file.name;
		window.document.body.appendChild(link);
		link.click();
		link.remove();
	} catch {
		os.alert({ type: 'error', text: i18n.ts._abuseUserReport.evidenceDownloadFailed });
	} finally {
		if (objectUrl != null) {
			const completedUrl = objectUrl;
			window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
		}
		downloadingFiles.value.delete(file.id);
	}
}

const statusLabel = computed(() => {
	if (!resolved.value) return i18n.ts.unresolved;
	if (resolvedAs.value === 'accept') return `${i18n.ts.resolved} · ${i18n.ts._abuseUserReport.accept}`;
	if (resolvedAs.value === 'reject') return `${i18n.ts.resolved} · ${i18n.ts._abuseUserReport.reject}`;
	return i18n.ts.resolved;
});

const summary = computed(() => {
	const text = [props.report.reason ? i18n.ts._abuseReport._reasons[props.report.reason] : null, props.report.comment || snapshot.value?.content].filter(Boolean).join(' · ');
	return text.replace(/\s+/g, ' ').slice(0, 160);
});

const moderationNote = ref(props.report.moderationNote ?? '');

function saveModerationNote(value: string): Promise<unknown> {
	return os.apiWithDialog('admin/update-abuse-user-report', {
		reportId: props.report.id,
		moderationNote: value,
	});
}

async function resolve(decision: 'accept' | 'reject' | null) {
	if (resolved.value || moderating.value) return;
	resolving.value = true;
	try {
		await os.apiWithDialog('admin/resolve-abuse-user-report', {
			reportId: props.report.id,
			resolvedAs: decision,
		});
		localResolution.value = { resolvedAs: decision };
		emit('resolved', props.report.id);
	} catch (error) {
		if (error != null && typeof error === 'object' && 'code' in error && error.code === 'REPORT_ALREADY_RESOLVED') emit('refresh');
		return;
	} finally {
		resolving.value = false;
	}
}

async function forward() {
	if (props.report.targetUser?.host == null || forwarded.value || moderating.value) return;
	forwarding.value = true;
	try {
		await os.apiWithDialog('admin/forward-abuse-user-report', { reportId: props.report.id });
		forwardedLocally.value = true;
	} catch {
		return;
	} finally {
		forwarding.value = false;
	}
}

function showMenu(ev: PointerEvent) {
	os.popupMenu([{
		icon: 'ti ti-hash',
		text: `${i18n.ts.copy}: ID`,
		action: () => {
			copyToClipboard(props.report.id);
		},
	}, {
		icon: 'ti ti-json',
		text: `${i18n.ts.copy}: JSON`,
		action: () => {
			copyToClipboard(JSON.stringify({ ...props.report, resolved: resolved.value, resolvedAs: resolvedAs.value, forwarded: forwarded.value }, null, '\t'));
		},
	}], ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
.reportLabel {
	display: inline-flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.status {
	padding: 3px 8px;
	border-radius: 4px;
	font-size: 0.8em;
	font-weight: normal;
}

.unresolved {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, transparent);
}

.resolved {
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-buttonBg);
}

.details {
	display: flex;
	flex-direction: column;
	gap: 20px;
	min-width: 0;
}

.reportSections {
	display: flex;
	flex-direction: column;
	gap: 20px;
	min-width: 0;
}

.heading {
	margin: 0 0 10px;
	font-size: 0.9em;
	font-weight: 600;
}

.content {
	padding: 14px 16px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel));
}

.text {
	min-width: 0;
	line-height: 1.7;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.snapshotUser {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	overflow-wrap: anywhere;
}

.snapshotFiles {
	display: flex;
	flex-direction: column;
	gap: 16px;
	margin: 0;
	padding-left: 20px;
	overflow-wrap: anywhere;
}

.evidenceDownload {
	align-self: flex-start;
	text-align: start;

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.hint {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.reason {
	display: inline-block;
	padding: 8px 12px;
	border-radius: 6px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.9em;
}

.more {
	margin-left: auto;
	width: 34px;
	height: 34px;
}
</style>
