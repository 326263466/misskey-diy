<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="forModeration ? `/admin/roles/${role.id}` : `/roles/${role.id}`" :class="$style.root" tabindex="-1" :style="{ '--color': role.color }">
	<template v-if="forModeration">
		<i v-if="'isPublic' in role && role.isPublic" class="ti ti-world" :class="$style.icon" style="color: var(--MI_THEME-success)"></i>
		<i v-else class="ti ti-lock" :class="$style.icon" style="color: var(--MI_THEME-warn)"></i>
	</template>

	<div ref="body" class="_panel" :class="$style.body">
		<div :class="$style.bodyTitle">
			<span :class="$style.bodyIcon">
				<template v-if="role.iconUrl">
					<img :class="$style.bodyBadge" :src="preload ? role.iconUrl : undefined" alt="" decoding="async"/>
				</template>
				<template v-else>
					<i v-if="role.isAdministrator" class="ti ti-crown" style="color: var(--MI_THEME-accent);"></i>
					<i v-else-if="role.isModerator" class="ti ti-shield" style="color: var(--MI_THEME-accent);"></i>
					<i v-else class="ti ti-user" style="color: var(--MI_THEME-fgTransparentWeak);"></i>
				</template>
			</span>
			<span :class="$style.bodyName"><Mfm :text="role.name" :plain="true" :nowrap="true"/></span>
			<template v-if="detailed && 'target' in role && 'usersCount' in role">
				<span v-if="role.target === 'manual'" :class="$style.bodyUsers">{{ i18n.tsx.nUsers({ n: role.usersCount }) }}</span>
				<span v-else-if="role.target === 'conditional'" :class="$style.bodyUsers">{{ i18n.tsx.nUsers({ n: '?' }) }}</span>
			</template>
		</div>
		<div :class="$style.bodyDescription"><Mfm :text="role.description" :plain="true" :nowrap="true"/></div>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { useImagePreload } from '@/composables/use-image-preload.js';

const props = withDefaults(defineProps<{
	role: Misskey.entities.Role | Misskey.entities.IResponse['roles'][number];
	forModeration: boolean;
	detailed?: boolean;
}>(), {
	detailed: true,
});

const body = useTemplateRef('body');
const iconRoot = computed(() => props.role.iconUrl ? body.value : null);
const preload = useImagePreload(iconRoot, () => false);
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
}

.icon {
	margin: 0 12px;
}

.body {
	display: block;
	padding: var(--MI-cardPadding);
	flex: 1;
	border-left: solid 6px var(--color);
}

.bodyTitle {
	display: flex;
}

.bodyIcon {
	margin-right: 8px;
	min-width: 1.3em;
}

.bodyBadge {
	height: 1.3em;
	vertical-align: -0.275em;
}

.bodyName {
	font-weight: bold;
}

.bodyUsers {
	margin-left: auto;
	color: var(--MI_THEME-fgTransparentWeak);
}

.bodyDescription {
	color: var(--MI_THEME-fgTransparent);
	font-size: 85%;
}
</style>
