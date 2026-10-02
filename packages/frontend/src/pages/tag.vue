<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<template #header-actions>
		<MkPaginationControl :paginator="paginator"/>
	</template>
	<div class="_pageBody">
		<MkNotesTimeline :paginator="paginator" :withControl="false"/>
	</div>
	<template v-if="$i" #footer>
		<div :class="$style.footer">
			<div class="_pageFooter">
				<MkButton rounded primary :class="$style.button" @click="post()"><i class="ti ti-plus"></i>{{ i18n.ts.postToHashtag }}</MkButton>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { genEmbedCode } from '@/utility/get-embed-code.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	tag: string;
}>();

const paginator = markRaw(new Paginator('notes/search-by-tag', {
	limit: 10,
	computedParams: computed(() => ({
		tag: props.tag,
	})),
}));

async function post() {
	await os.post({ initialHashtags: [props.tag] });
	paginator.reload();
}

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	text: i18n.ts.more,
	handler: (ev) => {
		os.popupMenu([{
			text: i18n.ts.embed,
			icon: 'ti ti-code',
			action: () => {
				genEmbedCode('tags', props.tag);
			},
		}], ev.currentTarget ?? ev.target);
	},
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: props.tag,
	icon: 'ti ti-hash',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: solid 0.5px var(--MI_THEME-divider);
	display: flex;
}

.button {
	margin: 0 auto;
}
</style>
