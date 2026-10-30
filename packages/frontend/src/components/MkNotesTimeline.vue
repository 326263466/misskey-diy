<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="paginator" :direction="direction" :autoLoad="autoLoad" :pullToRefresh="pullToRefresh" :withControl="withControl" :pageEmpty="pageEmpty">
	<template #empty="{ fetching }"><MkResult type="empty" :text="i18n.ts.noNotes" :page="pageEmpty" :loading="fetching"/></template>

	<template #default="{ items: notes }">
		<div :class="[$style.root, { [$style.noGap]: noGap, '_gaps': !noGap }, noGap ? '_card' : null]">
			<template v-for="(note, i) in notes" :key="note.id">
				<div
					v-if="i > 0 && isSeparatorNeeded(notes[i - 1].createdAt, note.createdAt)"
					:data-scroll-anchor="note.id"
					:class="[{ '_gaps': !noGap }, { [$style.lastNoteItem]: i === notes.length - 1 }]"
				>
					<MkNote :class="[$style.note, { [$style.lastNote]: i === notes.length - 1 }, !noGap ? '_card' : null]" :note="note" :withHardMute="true"/>
					<div v-if="note._shouldInsertAd_" :class="[$style.ad, !noGap ? '_card' : null]">
						<MkAd edgeToEdge :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
				<div v-else-if="note._shouldInsertAd_" :class="[{ '_gaps': !noGap }, { [$style.lastNoteItem]: i === notes.length - 1 }]" :data-scroll-anchor="note.id">
					<MkNote :class="[$style.note, { [$style.lastNote]: i === notes.length - 1 }, !noGap ? '_card' : null]" :note="note" :withHardMute="true"/>
					<div :class="[$style.ad, !noGap ? '_card' : null]">
						<MkAd edgeToEdge :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
				<MkNote v-else :class="[$style.note, { [$style.lastNote]: i === notes.length - 1 }, !noGap ? '_card' : null]" :note="note" :withHardMute="true" :data-scroll-anchor="note.id"/>
			</template>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup generic="T extends IPaginator<Misskey.entities.Note>">
import * as Misskey from 'misskey-js';
import type { MkPaginationOptions } from '@/components/MkPagination.vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkNote from '@/components/MkNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';
import { isSeparatorNeeded } from '@/utility/timeline-date-separate.js';

const props = withDefaults(defineProps<MkPaginationOptions & {
	paginator: T;
	noGap?: boolean;
}>(), {
	autoLoad: true,
	direction: 'down',
	pullToRefresh: true,
	withControl: true,
	pageEmpty: false,
});

useGlobalEvent('noteDeleted', (noteId) => {
	props.paginator.removeItem(noteId);
});

function reload() {
	return props.paginator.reload();
}

defineExpose({
	reload,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;

	&.noGap {
		background: var(--MI_THEME-panel);
		border-radius: var(--MI-cardRadius);
		overflow: clip;

		.note {
			border-radius: 0;
			border-bottom: var(--MI-divider);
		}

		.lastNote {
			border-bottom: none;
		}

		.lastNoteItem > .ad {
			border-bottom: none;
		}

		.ad {
			border-bottom: var(--MI-divider);
		}
	}

	&:not(.noGap) {
		background: var(--MI_THEME-bg);

		.note {
			background: var(--MI_THEME-panel);
			border-radius: var(--MI-cardRadius);
		}

		.ad {
			overflow: clip;
		}
	}

	.note {
		position: relative;

		&:hover {
			z-index: 1;
			background: var(--MI_THEME-panelHighlight);
			box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);
		}

		&:active {
			background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel));
		}
	}
}

.ad:empty {
	display: none;
}
</style>
